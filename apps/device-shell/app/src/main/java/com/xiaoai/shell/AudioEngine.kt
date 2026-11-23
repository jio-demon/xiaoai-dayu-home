package com.xiaoai.shell

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.util.Base64
import android.util.Log
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.sqrt

/**
 * 音频引擎：16kHz 单声道采集（KWS 常开 / 录音两种模式）+ MediaPlayer 播报。
 * 录音结束（VAD 静音 700ms / 15s 上限 / 手动 stopMic）→ 发 vad end，JS 取 PCM 走云端 ASR。
 */
class AudioEngine(private val app: App, private val bridge: Bridge, private val store: Store) {
    private val kws = KwsEngine(app.assets, wakeWord())
    private var thread: Thread? = null
    @Volatile private var running = false
    @Volatile private var mode: String? = null
    private var record: AudioRecord? = null
    @Volatile private var recordCh = 1
    private val pcmBuf = ByteArrayOutputStream()
    @Volatile private var recordedB64: String? = null
    @Volatile private var finalized = false
    private var vadActive = false
    private var speechMs = 0
    private var silenceMs = 0
    private var recordMs = 0
    private var player: MediaPlayer? = null
    private var playerCb: Int = -1
    private var playerFile: File? = null

    private fun wakeWord(): String = runCatching {
        JSONObject(store.get("config") ?: "{}").optString("wakeWord", "大肥鱼")
    }.getOrDefault("大肥鱼")

    private fun volume(): Float = runCatching {
        JSONObject(store.get("config") ?: "{}").optDouble("volume", 0.8).toFloat()
    }.getOrDefault(0.8f)

    @SuppressLint("MissingPermission")
    @Synchronized
    fun startMic(m: String) {
        stopMicInternal(finalize = false)
        mode = m
        finalized = false
        vadActive = false; speechMs = 0; silenceMs = 0; recordMs = 0
        pcmBuf.reset(); recordedB64 = null
        kws.resetVad()
        // LX04 麦克风走 ES7243→TDM：必须复刻原厂 MiVpmService 的
        // source=VOICE_RECOGNITION + index mask 0x1000C（3ch=2mic+ref），
        // 普通 MIC/mono 会路由到 ADDA 假麦克风（数字噪声）。失败再回退 mono。
        var ch = 3
        var rec = runCatching {
            AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, 0x1000C, AudioFormat.ENCODING_PCM_16BIT, 1920 * 8)
        }.getOrNull()
        if (rec == null || rec.state != AudioRecord.STATE_INITIALIZED) {
            runCatching { rec?.release() }
            ch = 1
            val minBuf = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            rec = AudioRecord(MediaRecorder.AudioSource.MIC, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, minBuf * 4)
        }
        if (rec.state != AudioRecord.STATE_INITIALIZED) { rec.release(); bridge.emit(JSONObject().put("type", "mic").put("state", "off")); return }
        recordCh = ch
        record = rec
        rec.startRecording()
        running = true
        Log.i(TAG, "startMic($m) kws=${kws.kwsEnabled} vad=${kws.vadEnabled}")
        bridge.emit(JSONObject().put("type", "mic").put("state", "on"))
        thread = Thread({ loop(rec) }, "mic-loop").apply { isDaemon = true; start() }
    }

    private fun loop(rec: AudioRecord) {
        val ch = recordCh
        val shorts = ShortArray(1600 * ch) // 100ms（3ch 时为交织帧）
        val mono = ShortArray(1600)
        val floats = FloatArray(1600)
        // TDM 双麦软件增益：ES7243 默认 PGA 偏低，实测远讲 rms≈0.03，放大后 KWS/ASR 更稳
        val gain = if (ch == 3) 4.0f else 1.0f
        var lastLog = 0L
        var lastLevelEmit = 0L
        var peakRms = 0.0
        var speechChunks = 0
        var chunks = 0
        Log.i(TAG, "采集循环启动 mode=$mode kws=${kws.kwsEnabled} vad=${kws.vadEnabled}")
        while (running) {
            // stopMicInternal 先置 running=false 再 join：若此刻正阻塞在 read，
            // 旧线程醒来后会继续喂已 reset 的 KWS/VAD —— 用身份校验立即退出
            if (!running || record !== rec) break
            val n = rec.read(shorts, 0, shorts.size)
            if (!running || record !== rec) break
            if (n <= 0) { if (n < 0) Log.w(TAG, "rec.read 错误: $n"); continue }
            // 3ch 交织 → 取 mic0（ch0），加软增益并削波
            val frames = n / ch
            var sum = 0.0
            for (i in 0 until frames) {
                var v = shorts[i * ch] / 32768f * gain
                if (v > 1f) v = 1f else if (v < -1f) v = -1f
                mono[i] = (v * 32767f).toInt().toShort()
                floats[i] = v; sum += v * v
            }
            val rms = sqrt(sum / frames)
            if (rms > peakRms) peakRms = rms
            val now = System.currentTimeMillis()
            // audioLevel 事件限频 ~10Hz：每 100ms evaluateJavascript 会拖垮 Chrome61 主线程
            if (now - lastLevelEmit >= 100) {
                lastLevelEmit = now
                bridge.emit(JSONObject().put("type", "audioLevel").put("level", minOf(1.0, rms * 8)))
            }
            val chunkMs = frames * 1000 / 16000
            val m = mode
            if (m == "kws") {
                if (rms > 0.015) Log.i(TAG, "KWS 语音段 rms=%.4f".format(rms))
                val kw = kws.accept(floats.copyOf(frames))
                if (kw != null && running && record === rec) {
                    Log.i(TAG, "唤醒命中: $kw")
                    bridge.emit(JSONObject().put("type", "kws").put("word", kw))
                }
            } else if (m == "record" && !finalized) {
                val bytes = ByteArray(frames * 2)
                for (i in 0 until frames) {
                    bytes[i * 2] = (mono[i].toInt() and 0xff).toByte()
                    bytes[i * 2 + 1] = (mono[i].toInt() shr 8).toByte()
                }
                synchronized(pcmBuf) { pcmBuf.write(bytes) }
                recordMs += chunkMs
                chunks++
                // silero VAD 优先，缺失时退回能量 VAD
                val speech = kws.vadSpeech(floats.copyOf(frames)) ?: (rms > 0.02)
                if (speech) speechChunks++
                if (speech) {
                    speechMs += chunkMs; silenceMs = 0
                    if (!vadActive && speechMs >= 200) { vadActive = true; bridge.emit(JSONObject().put("type", "vad").put("state", "start")) }
                } else if (vadActive) {
                    silenceMs += chunkMs
                    if (silenceMs >= 700) { Log.i(TAG, "VAD 静音收尾 recordMs=$recordMs"); finalizeRecord(); continue }
                }
                // 上限兜底：一直没检测到语音 6s 就收（避免底噪导致永远「在听」）；说过话最多 15s
                if (recordMs >= 15000 || (!vadActive && recordMs >= 6000)) {
                    Log.i(TAG, "录音超时收尾 recordMs=$recordMs vadActive=$vadActive")
                    finalizeRecord(); continue
                }
            }
            if (now - lastLog >= 2000) {
                lastLog = now
                Log.i(TAG, "mode=$mode rms=%.4f peak=%.4f recMs=%d speech=%d/%d silMs=%d".format(rms, peakRms, recordMs, speechChunks, chunks, silenceMs))
                peakRms = 0.0; speechChunks = 0; chunks = 0
            }
        }
        Log.i(TAG, "采集循环退出 mode=$mode")
    }

    private fun finalizeRecord() {
        if (finalized || mode != "record") return
        finalized = true
        val pcm = synchronized(pcmBuf) { pcmBuf.toByteArray() }
        recordedB64 = Base64.encodeToString(pcm, Base64.NO_WRAP)
        Log.i(TAG, "录音结束 ${pcm.size / 32}ms vadActive=$vadActive，交给 JS 识别")
        bridge.emit(JSONObject().put("type", "vad").put("state", "end"))
    }

    @Synchronized
    fun stopMic() = stopMicInternal(finalize = true)

    private fun stopMicInternal(finalize: Boolean) {
        if (finalize && mode == "record" && !finalized) finalizeRecord()
        running = false
        thread?.join(300)
        thread = null
        record?.let { runCatching { it.stop() }; it.release() }
        record = null
        mode = null
    }

    fun readRecordedPcm(): String? = recordedB64

/** 调试注入：把 WAV(16k mono PCM16) 文件当作麦克风输入走完整 KWS→录音链路。
     * 唤醒前由本线程喂 KWS；JS startMic(record) 接管后只往 pcmBuf 写音频，
     * VAD/收尾全部交给 mic-loop（唯一 native 调用方），避免并发 SIGSEGV。 */
    fun injectPcm(path: String) {
        Thread({
            try {
                val bytes = File(path).readBytes()
                var off = 44 // 标准 WAV 头
                runCatching {
                    var i = 12
                    while (i + 8 < bytes.size) {
                        val id = String(bytes, i, 4, Charsets.US_ASCII)
                        val sz = (bytes[i+4].toInt() and 0xff) or ((bytes[i+5].toInt() and 0xff) shl 8) or ((bytes[i+6].toInt() and 0xff) shl 16) or ((bytes[i+7].toInt() and 0xff) shl 24)
                        if (id == "data") { off = i + 8; break }
                        i += 8 + sz + (sz and 1)
                    }
                }
                stopMicInternal(finalize = false)
                mode = "inject"; finalized = false
                vadActive = false; speechMs = 0; silenceMs = 0; recordMs = 0
                pcmBuf.reset(); recordedB64 = null
                kws.resetVad()
                running = true
                Log.i(TAG, "injectPcm 开始 ${bytes.size - off} bytes")
                val floats = FloatArray(1600)
                var pos = off
                var woke = false
                var handedOver = false
                while (running && pos + 2 <= bytes.size) {
                    var n = 0
                    val b2 = ByteArray(3200)
                    while (n < 1600 && pos + 2 <= bytes.size) {
                        val lo = bytes[pos].toInt() and 0xff
                        val hi = bytes[pos+1].toInt()
                        val v = (lo or (hi shl 8)).toShort()
                        floats[n] = v / 32768f
                        b2[n*2] = lo.toByte(); b2[n*2+1] = hi.toByte()
                        pos += 2; n++
                    }
                    if (!woke && mode == "inject") {
                        val kw = kws.accept(floats.copyOf(n))
                        if (kw != null) {
                            Log.i(TAG, "注入唤醒命中: $kw")
                            woke = true
                            bridge.emit(JSONObject().put("type", "kws").put("word", kw))
                        }
                    } else if (mode == "record" && !finalized) {
                        // 等 JS startMic(record) 真正接管（pcmBuf 已重置）再写，避免竞态丢音频
                        if (!handedOver) {
                            var wait = 0
                            while (running && mode == "inject" && wait < 2000) { Thread.sleep(20); wait += 20 }
                            if (mode != "record" || finalized) break
                            handedOver = true
                        }
                        // 只写缓冲；VAD、超时、finalize 都由 mic-loop 负责
                        synchronized(pcmBuf) { pcmBuf.write(b2, 0, n * 2) }
                    } else if (woke) {
                        break // JS 没接管或已收尾
                    }
                    Thread.sleep(n * 1000L / 16000)
                }
                Log.i(TAG, "injectPcm 结束 woke=$woke handedOver=$handedOver")
                if (mode == "inject") { mode = null; running = false }
            } catch (e: Exception) { Log.w(TAG, "injectPcm: ${e.message}") }
        }, "pcm-inject").apply { isDaemon = true; start() }
    }

        fun debugPlayAndDumpSrc(wavPath: String, secs: Int, src: Int): Long {
        playTestWav(wavPath)
        Thread.sleep(200)
        return debugDumpMicSrc(secs, src)
    }
    /** 调试：3 通道采集（复刻原厂 MiVpmService：source=6 + FRONT|BACK|0x10000 → TDM 2mic+ref）。ch 选通道。 */
    @SuppressLint("MissingPermission")
    fun debugDumpMic3ch(secs: Int, source: Int, ch: Int): Long {
        stopMicInternal(finalize = false)
        val mask = 0x1000C // 原厂 MiVpmService 同款 index mask：3ch（2mic+ref）
        val minBuf = AudioRecord.getMinBufferSize(16000, mask, AudioFormat.ENCODING_PCM_16BIT)
        Log.i(TAG, "debugDumpMic3ch minBuf=$minBuf mask=0x${Integer.toHexString(mask)}")
        val rec = AudioRecord(source, 16000, mask, AudioFormat.ENCODING_PCM_16BIT, Math.max(minBuf, 1920) * 4)
        if (rec.state != AudioRecord.STATE_INITIALIZED) { rec.release(); startMic("kws"); return -1 }
        mode = "debug-dump"
        rec.startRecording()
        val out = ByteArrayOutputStream()
        var maxRms = 0.0
        try {
            val shorts = ShortArray(1600 * 3)
            for (c in 0 until secs * 10) {
                val n = rec.read(shorts, 0, shorts.size)
                if (n <= 0) continue
                var sum = 0.0; var cnt = 0
                var i = ch
                while (i < n) {
                    val f = shorts[i] / 32768f; sum += f * f; cnt++
                    out.write(shorts[i].toInt() and 0xff); out.write((shorts[i].toInt() shr 8) and 0xff)
                    i += 3
                }
                if (cnt > 0) { val rms = sqrt(sum / cnt); if (rms > maxRms) maxRms = rms }
            }
        } finally { rec.stop(); rec.release() }
        val pcm = out.toByteArray()
        val f = File(app.cacheDir, "mic-dump.wav")
        f.outputStream().use { os ->
            fun le32(v: Int) { os.write(v and 0xff); os.write((v shr 8) and 0xff); os.write((v shr 16) and 0xff); os.write((v shr 24) and 0xff) }
            fun le16(v: Int) { os.write(v and 0xff); os.write((v shr 8) and 0xff) }
            os.write("RIFF".toByteArray()); le32(36 + pcm.size); os.write("WAVEfmt ".toByteArray())
            le32(16); le16(1); le16(1); le32(16000); le32(32000); le16(2); le16(16)
            os.write("data".toByteArray()); le32(pcm.size); os.write(pcm)
        }
        Log.i(TAG, "debugDumpMic3ch src=$source ch=$ch ${secs}s maxRms=%.4f bytes=%d".format(maxRms, pcm.size))
        startMic("kws")
        return pcm.size.toLong()
    }
    /** 调试：扬声器播 WAV 同时用 3 通道模式采集。 */
    fun debugPlayAndDump3ch(wavPath: String, secs: Int, source: Int, ch: Int): Long {
        playTestWav(wavPath)
        Thread.sleep(200)
        return debugDumpMic3ch(secs, source, ch)
    }
    /** 调试：用指定 AudioSource 采集（9=UNPROCESSED 绕过 HAL 降噪）。 */
    @SuppressLint("MissingPermission")
    fun debugDumpMicSrc(secs: Int, source: Int): Long {
        stopMicInternal(finalize = false)
        val minBuf = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val rec = AudioRecord(source, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, minBuf * 4)
        if (rec.state != AudioRecord.STATE_INITIALIZED) { rec.release(); startMic("kws"); return -1 }
        mode = "debug-dump"
        rec.startRecording()
        val out = ByteArrayOutputStream()
        var maxRms = 0.0
        try {
            val shorts = ShortArray(1600)
            for (c in 0 until secs * 10) {
                val n = rec.read(shorts, 0, shorts.size)
                if (n <= 0) continue
                var sum = 0.0
                for (i in 0 until n) {
                    val f = shorts[i] / 32768f; sum += f * f
                    out.write(shorts[i].toInt() and 0xff); out.write((shorts[i].toInt() shr 8) and 0xff)
                }
                val rms = sqrt(sum / n); if (rms > maxRms) maxRms = rms
            }
        } finally { rec.stop(); rec.release() }
        val pcm = out.toByteArray()
        val f = File(app.cacheDir, "mic-dump.wav")
        f.outputStream().use { os ->
            fun le32(v: Int) { os.write(v and 0xff); os.write((v shr 8) and 0xff); os.write((v shr 16) and 0xff); os.write((v shr 24) and 0xff) }
            fun le16(v: Int) { os.write(v and 0xff); os.write((v shr 8) and 0xff) }
            os.write("RIFF".toByteArray()); le32(36 + pcm.size); os.write("WAVEfmt ".toByteArray())
            le32(16); le16(1); le16(1); le32(16000); le32(32000); le16(2); le16(16)
            os.write("data".toByteArray()); le32(pcm.size); os.write(pcm)
        }
        Log.i(TAG, "debugDumpMicSrc src=$source ${secs}s maxRms=%.4f bytes=%d".format(maxRms, pcm.size))
        startMic("kws")
        return pcm.size.toLong()
    }
    /** 调试：读 WAV 文件直接喂 KWS（不动麦克风），返回命中词。 */
    fun debugFeedFile(path: String): String? {
        val bytes = File(path).readBytes()
        var off = 44
        runCatching {
            var i = 12
            while (i + 8 < bytes.size) {
                val id = String(bytes, i, 4, Charsets.US_ASCII)
                val sz = (bytes[i+4].toInt() and 0xff) or ((bytes[i+5].toInt() and 0xff) shl 8) or ((bytes[i+6].toInt() and 0xff) shl 16) or ((bytes[i+7].toInt() and 0xff) shl 24)
                if (id == "data") { off = i + 8; break }
                i += 8 + sz + (sz and 1)
            }
        }
        var hit: String? = null
        val floats = FloatArray(1600)
        var pos = off
        while (pos + 2 <= bytes.size) {
            var n = 0
            while (n < 1600 && pos + 2 <= bytes.size) {
                val v = ((bytes[pos].toInt() and 0xff) or (bytes[pos+1].toInt() shl 8)).toShort()
                floats[n] = v / 32768f; pos += 2; n++
            }
            if (hit == null) hit = kws.accept(floats.copyOf(n))
        }
        Log.i(TAG, "debugFeedFile hit=%s".format(hit ?: "-"))
        return hit
    }
    /** 调试：设备扬声器播 WAV 的同时采集麦克风 PCM，存 cache/mic-dump.wav。 */
    fun debugPlayAndDump(wavPath: String, secs: Int): Long {
        playTestWav(wavPath)
        Thread.sleep(200)
        return debugDumpMic(secs)
    }
    /** 调试：采集 secs 秒麦克风原始 PCM 存 cache/mic-dump.wav（16k mono），供拉回分析。 */
    @SuppressLint("MissingPermission")
    fun debugDumpMic(secs: Int): Long {
        stopMicInternal(finalize = false)
        val minBuf = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val rec = AudioRecord(MediaRecorder.AudioSource.MIC, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, minBuf * 4)
        if (rec.state != AudioRecord.STATE_INITIALIZED) { rec.release(); startMic("kws"); return -1 }
        mode = "debug-dump"
        rec.startRecording()
        val out = ByteArrayOutputStream()
        var maxRms = 0.0
        try {
            val shorts = ShortArray(1600)
            for (c in 0 until secs * 10) {
                val n = rec.read(shorts, 0, shorts.size)
                if (n <= 0) continue
                var sum = 0.0
                for (i in 0 until n) {
                    val f = shorts[i] / 32768f; sum += f * f
                    out.write(shorts[i].toInt() and 0xff); out.write((shorts[i].toInt() shr 8) and 0xff)
                }
                val rms = sqrt(sum / n); if (rms > maxRms) maxRms = rms
            }
        } finally { rec.stop(); rec.release() }
        val pcm = out.toByteArray()
        val f = File(app.cacheDir, "mic-dump.wav")
        f.outputStream().use { os ->
            fun le32(v: Int) { os.write(v and 0xff); os.write((v shr 8) and 0xff); os.write((v shr 16) and 0xff); os.write((v shr 24) and 0xff) }
            fun le16(v: Int) { os.write(v and 0xff); os.write((v shr 8) and 0xff) }
            os.write("RIFF".toByteArray()); le32(36 + pcm.size); os.write("WAVEfmt ".toByteArray())
            le32(16); le16(1); le16(1); le32(16000); le32(32000); le16(2); le16(16)
            os.write("data".toByteArray()); le32(pcm.size); os.write(pcm)
        }
        Log.i(TAG, "debugDumpMic ${secs}s maxRms=%.4f bytes=%d".format(maxRms, pcm.size))
        startMic("kws")
        return pcm.size.toLong()
    }
    /** 调试：临时接管麦克风采集 secs 秒，把原始 PCM 直接喂 KWS（绕过声学回路），返回命中词。 */
    @SuppressLint("MissingPermission")
    fun debugFeedKws(secs: Int): String? {
        stopMicInternal(finalize = false)
        val prevMode = "kws"
        val minBuf = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val rec = AudioRecord(MediaRecorder.AudioSource.MIC, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, minBuf * 4)
        if (rec.state != AudioRecord.STATE_INITIALIZED) { rec.release(); startMic(prevMode); return null }
        mode = "debug-feed"
        rec.startRecording()
        var hit: String? = null
        var maxRms = 0.0
        try {
            val shorts = ShortArray(1600)
            val floats = FloatArray(1600)
            val total = secs * 10 // 100ms 块
            for (c in 0 until total) {
                val n = rec.read(shorts, 0, shorts.size)
                if (n <= 0) continue
                var sum = 0.0
                for (i in 0 until n) { val f = shorts[i] / 32768f; floats[i] = f; sum += f * f }
                val rms = sqrt(sum / n)
                if (rms > maxRms) maxRms = rms
                if (hit == null) hit = kws.accept(floats.copyOf(n))
            }
        } finally {
            rec.stop(); rec.release()
            Log.i(TAG, "debugFeedKws ${secs}s maxRms=%.4f hit=%s".format(maxRms, hit ?: "-"))
            startMic(prevMode)
        }
        return hit
    }
    /** 调试：AudioTrack 直放 16k mono WAV（不走 MediaPlayer，避免被系统播放器接管）。 */
    fun playTestWav(path: String) {
        Thread({
            try {
                val bytes = File(path).readBytes()
                var off = 44
                runCatching {
                    var i = 12
                    while (i + 8 < bytes.size) {
                        val id = String(bytes, i, 4, Charsets.US_ASCII)
                        val sz = (bytes[i+4].toInt() and 0xff) or ((bytes[i+5].toInt() and 0xff) shl 8) or ((bytes[i+6].toInt() and 0xff) shl 16) or ((bytes[i+7].toInt() and 0xff) shl 24)
                        if (id == "data") { off = i + 8; break }
                        i += 8 + sz + (sz and 1)
                    }
                }
                val minBuf = android.media.AudioTrack.getMinBufferSize(16000, android.media.AudioFormat.CHANNEL_OUT_MONO, android.media.AudioFormat.ENCODING_PCM_16BIT)
                val track = android.media.AudioTrack(android.media.AudioManager.STREAM_MUSIC, 16000,
                    android.media.AudioFormat.CHANNEL_OUT_MONO, android.media.AudioFormat.ENCODING_PCM_16BIT,
                    maxOf(minBuf, 8192), android.media.AudioTrack.MODE_STREAM)
                track.setStereoVolume(1f, 1f)
                track.play()
                Log.i(TAG, "playTestWav 开始 ${bytes.size - off} bytes")
                track.write(bytes, off, bytes.size - off)
                track.stop(); track.release()
                Log.i(TAG, "playTestWav 结束")
            } catch (e: Exception) { Log.w(TAG, "playTestWav: ${e.message}") }
        }, "wav-play").apply { isDaemon = true; start() }
    }

    /** 播放 {mime,data|url,cb}；完成或停止都回调 window.__audioDone(cb)。 */
    @Synchronized
    fun playAudio(json: String) {
        stopAudio()
        val o = JSONObject(json)
        val cb = o.optInt("cb", -1)
        try {
            val bytes = when {
                o.has("data") -> Base64.decode(o.getString("data"), Base64.DEFAULT)
                o.has("url") -> download(o.getString("url"))
                else -> return done(cb)
            }
            val ext = if (o.optString("mime").contains("wav")) "wav" else "mp3"
            val f = File(app.cacheDir, "tts_$cb.$ext")
            f.writeBytes(bytes)
            val mp = MediaPlayer()
            mp.setDataSource(f.absolutePath)
            mp.setVolume(volume(), volume())
            mp.setOnCompletionListener { done(cb) }
            mp.setOnErrorListener { _, _, _ -> done(cb); true }
            mp.prepare()
            player = mp; playerCb = cb; playerFile = f
            mp.start()
        } catch (e: Exception) {
            Log.w(TAG, "播放失败: ${e.message}")
            done(cb)
        }
    }

    @Synchronized
    fun stopAudio() {
        val cb = playerCb
        player?.let { runCatching { it.stop() }; it.release() }
        player = null; playerCb = -1
        playerFile?.delete(); playerFile = null
        if (cb >= 0) bridge.audioDone(cb)
    }

    private fun done(cb: Int) {
        synchronized(this) {
            player = null; playerCb = -1
            playerFile?.delete(); playerFile = null
        }
        if (cb >= 0) bridge.audioDone(cb)
    }

    private fun download(url: String): ByteArray {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15000; conn.readTimeout = 30000
        conn.inputStream.use { return it.readBytes() }
    }

    companion object { private const val TAG = "AudioEngine" }
}
