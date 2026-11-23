package com.xiaoai.shell

import android.content.res.AssetManager
import android.util.Log
import java.lang.reflect.Method

/**
 * sherpa-onnx 本地唤醒（KWS「大肥鱼」+ silero VAD）。
 * 通过反射调用：AAR 放 app/libs、模型放 assets/kws/ 即启用；任一缺失则优雅禁用，
 * 不影响「点麦克风说话」链路。反射兼容新旧版本 API：
 *  - v2.x：KeywordSpotterConfig(OnlineModelConfig(OnlineTransducerModelConfig)) + keywordsFile
 *  - v1.x：KeywordSpotterConfig(KeywordSpotterTransducerModelConfig) + keywordsBuf
 */
class KwsEngine(private val assets: AssetManager, wakeWord: String) {
    private var spotter: Any? = null
    private var stream: Any? = null
    private var vad: Any? = null
    private var mIsReady: Method? = null
    private var mDecode: Method? = null
    private var mGetResult: Method? = null
    private var mAccept: Method? = null
    private var mVadAccept: Method? = null
    private var mVadDetected: Method? = null

    val kwsEnabled: Boolean get() = spotter != null && stream != null
    val vadEnabled: Boolean get() = vad != null

    init {
        try { initKws(wakeWord) } catch (t: Throwable) { Log.w(TAG, "KWS 不可用: ${t.message}"); spotter = null }
        try { initVad() } catch (t: Throwable) { Log.w(TAG, "VAD 不可用: ${t.message}"); vad = null }
    }

    private fun hasAsset(name: String): Boolean =
        runCatching { assets.open(name).close(); true }.getOrDefault(false)

    private fun classExists(cls: String): Boolean =
        runCatching { Class.forName(cls); true }.getOrDefault(false)

    private fun initKws(wakeWord: String) {
        val enc = "kws/encoder.onnx"; val dec = "kws/decoder.onnx"; val join = "kws/joiner.onnx"; val tokens = "kws/tokens.txt"
        if (!listOf(enc, dec, join, tokens).all { hasAsset(it) }) return
        val feat = new("com.k2fsa.sherpa.onnx.FeatureConfig")
        set(feat, "sampleRate", 16000); set(feat, "featureDim", 80)

        // 唤醒词：优先 keywords.txt（拼音建模单元），否则退回原词
        val keywords = if (hasAsset("kws/keywords.txt"))
            assets.open("kws/keywords.txt").bufferedReader().readText().trim()
        else wakeWord

        val config = new("com.k2fsa.sherpa.onnx.KeywordSpotterConfig")
        set(config, "featConfig", feat)
        if (classExists("com.k2fsa.sherpa.onnx.OnlineModelConfig")) {
            // v2.x：OnlineModelConfig + OnlineTransducerModelConfig
            val transducer = new("com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig")
            set(transducer, "encoder", enc); set(transducer, "decoder", dec); set(transducer, "joiner", join)
            val model = new("com.k2fsa.sherpa.onnx.OnlineModelConfig")
            set(model, "transducer", transducer); set(model, "tokens", tokens)
            set(model, "numThreads", 2); set(model, "provider", "cpu")
            set(model, "modelingUnit", "ppinyin") // wenetspeech L 模型：带声调拼音建模单元
            set(model, "debug", false)
            set(config, "modelConfig", model)
            // v2.x 只有 keywordsFile（assets 相对路径）；keywordsBuf 是 v1 字段
            if (hasAsset("kws/keywords.txt")) set(config, "keywordsFile", "kws/keywords.txt")
            else set(config, "keywordsFile", "")
        } else {
            // v1.x 旧结构
            val transducer = new("com.k2fsa.sherpa.onnx.KeywordSpotterTransducerModelConfig")
            set(transducer, "encoder", enc); set(transducer, "decoder", dec); set(transducer, "joiner", join)
            val model = new("com.k2fsa.sherpa.onnx.KeywordSpotterModelConfig")
            set(model, "transducer", transducer); set(model, "tokens", tokens)
            set(model, "numThreads", 2); set(model, "provider", "cpu")
            set(config, "modelConfig", model)
            set(config, "keywordsBuf", keywords)
        }
        set(config, "maxActivePaths", 4); set(config, "keywordsScore", 2.0f)
        set(config, "keywordsThreshold", 0.12f); set(config, "numTrailingBlanks", 1)

        val cls = Class.forName("com.k2fsa.sherpa.onnx.KeywordSpotter")
        spotter = cls.constructors.firstOrNull { it.parameterTypes.size == 2 && it.parameterTypes[0] == AssetManager::class.java }
            ?.newInstance(assets, config)
            ?: cls.constructors.first { it.parameterTypes.size == 1 }.newInstance(config)
        val sp = spotter!!
        stream = runCatching { sp.javaClass.getMethod("createStream", String::class.java).invoke(sp, keywords) }
            .getOrElse { sp.javaClass.getMethod("createStream").invoke(sp) }
        mIsReady = method(sp, "isReady", 1)
        mDecode = method(sp, "decode", 1)
        mGetResult = method(sp, "getResult", 1)
        // v2.x acceptWaveform(float[], int) 在 OnlineStream 上；v1.x acceptWaveform(stream, float[]) 在 spotter 上
        mAccept = runCatching { method(sp, "acceptWaveform", 2) }
            .getOrElse { stream!!.javaClass.methods.first { it.name == "acceptWaveform" && it.parameterTypes.size == 2 } }
        Log.i(TAG, "KWS 已启用，唤醒词: $wakeWord")
    }

    private fun initVad() {
        if (!hasAsset("kws/silero_vad.onnx")) return
        val silero = new("com.k2fsa.sherpa.onnx.SileroVadModelConfig")
        set(silero, "model", "kws/silero_vad.onnx"); set(silero, "threshold", 0.5f)
        set(silero, "minSilenceDuration", 0.6f); set(silero, "minSpeechDuration", 0.2f)
        set(silero, "windowSize", 512)
        val config = new("com.k2fsa.sherpa.onnx.VadModelConfig")
        set(config, "sileroVadModelConfig", silero); set(config, "sampleRate", 16000)
        set(config, "numThreads", 1); set(config, "provider", "cpu")
        val cls = Class.forName("com.k2fsa.sherpa.onnx.Vad")
        vad = cls.constructors.firstOrNull { it.parameterTypes.size == 2 && it.parameterTypes[0] == AssetManager::class.java }
            ?.newInstance(assets, config)
            ?: cls.constructors.first { it.parameterTypes.size == 1 }.newInstance(config)
        mVadAccept = vad!!.javaClass.getMethod("acceptWaveform", FloatArray::class.java)
        mVadDetected = vad!!.javaClass.getMethod("isSpeechDetected")
        Log.i(TAG, "silero VAD 已启用")
    }



    // native OnlineStream/Vad 非线程安全：所有入口串行化，防止并发调用 SIGSEGV
    private val nativeLock = Any()

    /** 喂 100ms 音频；返回命中的唤醒词或 null。 */
    fun accept(samples: FloatArray): String? = synchronized(nativeLock) { acceptLocked(samples) }

    private fun acceptLocked(samples: FloatArray): String? {
        val sp = spotter ?: return null
        val st = stream ?: return null
        return try {
            if (mAccept!!.declaringClass.isInstance(sp)) {
                mAccept!!.invoke(sp, st, samples)          // v1: spotter.acceptWaveform(stream, samples)
            } else {
                mAccept!!.invoke(st, samples, 16000)       // v2: stream.acceptWaveform(samples, sampleRate)
            }
            while (mIsReady!!.invoke(sp, st) as Boolean) {
                mDecode!!.invoke(sp, st)
                val r = mGetResult!!.invoke(sp, st)
                val kw = r.javaClass.getMethod("getKeyword").invoke(r) as? String
                if (!kw.isNullOrBlank()) {
                    runCatching { sp.javaClass.getMethod("reset", stream!!.javaClass).invoke(sp, st) }
                    return kw
                }
            }
            null
        } catch (t: Throwable) { Log.w(TAG, "KWS decode: ${t.message}"); null }
    }

    /** silero VAD：返回当前是否检测到语音；不可用返回 null（上层退回能量 VAD）。 */
    fun vadSpeech(samples: FloatArray): Boolean? = synchronized(nativeLock) { vadSpeechLocked(samples) }

    private fun vadSpeechLocked(samples: FloatArray): Boolean? {
        val v = vad ?: return null
        return try {
            var i = 0
            while (i + 512 <= samples.size) {
                mVadAccept!!.invoke(v, samples.copyOfRange(i, i + 512))
                i += 512
            }
            mVadDetected!!.invoke(v) as Boolean
        } catch (t: Throwable) { null }
    }

    fun resetVad() = synchronized(nativeLock) { runCatching { vad?.javaClass?.getMethod("reset")?.invoke(vad) } }

    private fun method(obj: Any, name: String, argc: Int): Method =
        obj.javaClass.methods.first { it.name == name && it.parameterTypes.size == argc }

    private fun new(cls: String): Any = Class.forName(cls).getDeclaredConstructor().newInstance()
    private fun set(obj: Any, prop: String, value: Any) {
        val setter = "set" + prop.replaceFirstChar { it.uppercase() }
        runCatching {
            obj.javaClass.methods.first { it.name == setter && it.parameterTypes.size == 1 }.invoke(obj, value)
        } // 字段不存在（版本差异）时忽略
    }

    companion object { private const val TAG = "KwsEngine" }
}
