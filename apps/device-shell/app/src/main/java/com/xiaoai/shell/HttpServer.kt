package com.xiaoai.shell

import android.os.Handler
import android.os.Looper
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoWSD
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.CopyOnWriteArraySet

/**
 * 薄壳 Web 服务（:8080）：静态界面包 + REST 管理 API + /ws 实时中继。
 * 与 apps/web/src/net/api.ts、link.ts 的契约一一对应；密钥对管理端永远掩码。
 */
class HttpServer(private val app: App) : NanoWSD(8080) {
    private val tokens = CopyOnWriteArraySet<String>()
    private val devices = CopyOnWriteArraySet<WsSocket>()
    private val admins = CopyOnWriteArraySet<WsSocket>()
    private val main = Handler(Looper.getMainLooper())

    // ---------- WebSocket 中继 ----------
    inner class WsSocket(handshake: IHTTPSession) : NanoWSD.WebSocket(handshake) {
        var role: String? = null
        override fun onOpen() {}
        override fun onClose(code: NanoWSD.WebSocketFrame.CloseCode?, reason: String?, initiatedByRemote: Boolean) {
            devices.remove(this); admins.remove(this)
        }
        override fun onMessage(message: NanoWSD.WebSocketFrame) {
            if (message.textPayload == null) return
            val m = runCatching { JSONObject(message.textPayload) }.getOrNull() ?: return
            if (m.optString("type") == "hello") {
                role = m.optString("role")
                if (role == "device") devices.add(this) else admins.add(this)
                return
            }
            if (role == "device") {
                // 设备 → 管理端：config 需掩码
                if (m.optString("type") == "config") {
                    val masked = m.optJSONObject("config")?.let { maskConfig(it) }
                    if (masked != null) m.put("config", masked)
                }
                sendAll(admins, m.toString())
            } else if (role == "admin" && m.optString("type") == "cmd") {
                sendAll(devices, m.toString())
            }
        }
        override fun onPong(pong: NanoWSD.WebSocketFrame?) {}
        override fun onException(exception: java.io.IOException) { Log.w(TAG, "ws exception: ${exception.javaClass.simpleName}: ${exception.message}"); runCatching { close(NanoWSD.WebSocketFrame.CloseCode.AbnormalClosure, "err", false) } }
        fun sendSafe(json: String) { runCatching { send(json) } }
    }

    override fun openWebSocket(handshake: IHTTPSession): NanoWSD.WebSocket = WsSocket(handshake)

    private fun sendAll(set: Set<WsSocket>, json: String) = set.forEach { it.sendSafe(json) }
    private fun toDevice(json: String) = sendAll(devices, json)
    private fun toAdmins(json: String) = sendAll(admins, json)

    // ---------- HTTP ----------
    override fun serveHttp(session: IHTTPSession): Response {
        val uri = session.uri.trimEnd('/')
        val method = session.method.name
        if (method == "OPTIONS") return cors(newFixedLengthResponse(Response.Status.NO_CONTENT, MIME_PLAINTEXT, ""))
        return try {
            cors(when {
                uri == "/api/login" && method == "POST" -> login(session)
                uri == "/api/config" && method == "GET" -> getConfig(session)
                uri == "/api/config" && method == "PUT" -> putConfig(session)
                uri == "/api/memories" && method == "GET" -> json(mapOf("cards" to cards()))
                uri == "/api/memories" && method == "POST" -> upsertCard(session)
                uri == "/api/memories" && method == "DELETE" -> deleteCard(session)
                uri == "/api/sessions" && method == "GET" -> json(mapOf("sessions" to sessions()))
                uri == "/api/sessions" && method == "DELETE" -> deleteSession(session)
                uri == "/api/status" && method == "GET" -> json(mapOf("status" to (store("status")?.let { JSONObject(it) })))
                uri == "/api/update" && method == "POST" -> update(session)
                uri == "/api/debug/inject-pcm" && method == "POST" -> injectPcm(session)
                uri == "/api/debug/play-wav" && method == "POST" -> playWav(session)
                uri == "/api/debug/mic-raw" && method == "POST" -> micRaw(session)
                uri == "/api/debug/mic-dump" && method == "POST" -> micDump(session)
                uri == "/api/debug/mic-dump-src" && method == "POST" -> micDumpSrc(session)
                uri == "/api/debug/mic-dump-3ch" && method == "POST" -> micDump3ch(session)
                uri == "/api/debug/play-and-dump-3ch" && method == "POST" -> playAndDump3ch(session)
                uri == "/api/debug/play-and-dump" && method == "POST" -> playAndDump(session)
                uri == "/api/debug/play-and-dump-src" && method == "POST" -> playAndDumpSrc(session)
                uri == "/api/debug/mic-dump.wav" && method == "GET" -> micDumpGet()
                uri == "/api/debug/feed-dump" && method == "POST" -> feedDump()
                uri.startsWith("/api/") -> err(Response.Status.NOT_FOUND, "未知接口")
                uri.startsWith("/cloud-proxy/") -> cloudProxy(session, uri)
                else -> static(uri)
            })
        } catch (e: Exception) {
            Log.w(TAG, "serve $uri: ${e.message}")
            cors(err(Response.Status.INTERNAL_ERROR, e.message ?: "error"))
        }
    }

    /** 调试：扬声器播放 WAV（走 AudioTrack，声学回环测试 KWS）。 */
    private fun playAndDumpSrc(session: IHTTPSession): Response {
        val len = session.headers["content-length"]?.toIntOrNull() ?: 0
        if (len <= 44 || len > 8 * 1024 * 1024) return err(Response.Status.BAD_REQUEST, "WAV 大小非法")
        val buf = ByteArray(len)
        var read = 0
        while (read < len) {
            val n = session.inputStream.read(buf, read, len - read)
            if (n <= 0) break
            read += n
        }
        val f = java.io.File(app.cacheDir, "play-test.wav")
        f.outputStream().use { it.write(buf, 0, read) }
        val secs = session.parameters["secs"]?.firstOrNull()?.toIntOrNull() ?: 7
        val src = session.parameters["src"]?.firstOrNull()?.toIntOrNull() ?: 9
        val n = app.audio.debugPlayAndDumpSrc(f.absolutePath, secs.coerceIn(1, 20), src)
        return json(mapOf("ok" to (n > 0), "bytes" to n, "src" to src))
    }
    private fun playAndDump(session: IHTTPSession): Response {
        val len = session.headers["content-length"]?.toIntOrNull() ?: 0
        if (len <= 44 || len > 8 * 1024 * 1024) return err(Response.Status.BAD_REQUEST, "WAV 大小非法")
        val buf = ByteArray(len)
        var read = 0
        while (read < len) {
            val n = session.inputStream.read(buf, read, len - read)
            if (n <= 0) break
            read += n
        }
        val f = java.io.File(app.cacheDir, "play-test.wav")
        f.outputStream().use { it.write(buf, 0, read) }
        val secs = session.parameters["secs"]?.firstOrNull()?.toIntOrNull() ?: 7
        val n = app.audio.debugPlayAndDump(f.absolutePath, secs.coerceIn(1, 20))
        return json(mapOf("ok" to (n > 0), "bytes" to n))
    }
    /** 调试：把 mic-dump.wav 直接喂 KWS，验证声学采集内容能否命中唤醒词。 */
    private fun feedDump(): Response {
        val f = java.io.File(app.cacheDir, "mic-dump.wav")
        if (!f.exists()) return err(Response.Status.NOT_FOUND, "无 dump")
        val kw = app.audio.debugFeedFile(f.absolutePath)
        return json(mapOf("ok" to true, "keyword" to (kw ?: ""), "hit" to (kw != null)))
    }
    private fun micDump3ch(session: IHTTPSession): Response {
        val secs = session.parameters["secs"]?.firstOrNull()?.toIntOrNull() ?: 6
        val src = session.parameters["src"]?.firstOrNull()?.toIntOrNull() ?: 6
        val ch = session.parameters["ch"]?.firstOrNull()?.toIntOrNull() ?: 0
        val n = app.audio.debugDumpMic3ch(secs.coerceIn(1, 20), src, ch.coerceIn(0, 2))
        return json(mapOf("ok" to (n > 0), "bytes" to n, "src" to src, "ch" to ch))
    }
    private fun playAndDump3ch(session: IHTTPSession): Response {
        val len = session.headers["content-length"]?.toIntOrNull() ?: 0
        if (len <= 44 || len > 8 * 1024 * 1024) return err(Response.Status.BAD_REQUEST, "WAV 大小非法")
        val buf = ByteArray(len)
        var read = 0
        while (read < len) {
            val n = session.inputStream.read(buf, read, len - read)
            if (n <= 0) break
            read += n
        }
        val f = java.io.File(app.cacheDir, "play-test.wav")
        f.outputStream().use { it.write(buf, 0, read) }
        val secs = session.parameters["secs"]?.firstOrNull()?.toIntOrNull() ?: 7
        val src = session.parameters["src"]?.firstOrNull()?.toIntOrNull() ?: 6
        val ch = session.parameters["ch"]?.firstOrNull()?.toIntOrNull() ?: 0
        val n = app.audio.debugPlayAndDump3ch(f.absolutePath, secs.coerceIn(1, 20), src, ch.coerceIn(0, 2))
        return json(mapOf("ok" to (n > 0), "bytes" to n, "src" to src, "ch" to ch))
    }
    private fun micDumpSrc(session: IHTTPSession): Response {
        val secs = session.parameters["secs"]?.firstOrNull()?.toIntOrNull() ?: 6
        val src = session.parameters["src"]?.firstOrNull()?.toIntOrNull() ?: 9
        val n = app.audio.debugDumpMicSrc(secs.coerceIn(1, 20), src)
        return json(mapOf("ok" to (n > 0), "bytes" to n, "src" to src))
    }
    private fun micDump(session: IHTTPSession): Response {
        val secs = session.parameters["secs"]?.firstOrNull()?.toIntOrNull() ?: 6
        val n = app.audio.debugDumpMic(secs.coerceIn(1, 20))
        return json(mapOf("ok" to (n > 0), "bytes" to n))
    }

    private fun micDumpGet(): Response {
        val f = java.io.File(app.cacheDir, "mic-dump.wav")
        if (!f.exists()) return err(Response.Status.NOT_FOUND, "无 dump")
        return newFixedLengthResponse(Response.Status.OK, "audio/wav", f.inputStream(), f.length())
    }
    /** 调试：把最近一段麦克风原始 PCM 直接喂 KWS（绕过扬声器声学回路），返回是否命中。 */
    private fun micRaw(session: IHTTPSession): Response {
        val secs = session.parameters["secs"]?.firstOrNull()?.toIntOrNull() ?: 6
        val r = app.audio.debugFeedKws(secs.coerceIn(1, 15))
        return json(mapOf("ok" to true, "keyword" to (r ?: ""), "hit" to (r != null)))
    }
    private fun playWav(session: IHTTPSession): Response {
        val len = session.headers["content-length"]?.toIntOrNull() ?: 0
        if (len <= 44 || len > 8 * 1024 * 1024) return err(Response.Status.BAD_REQUEST, "WAV 大小非法")
        val buf = ByteArray(len)
        var read = 0
        while (read < len) {
            val n = session.inputStream.read(buf, read, len - read)
            if (n <= 0) break
            read += n
        }
        val f = java.io.File(app.cacheDir, "play-test.wav")
        f.outputStream().use { it.write(buf, 0, read) }
        app.audio.playTestWav(f.absolutePath)
        return json(mapOf("ok" to true, "bytes" to read))
    }

    private fun store(key: String) = app.store.get(key)
    private fun config(): JSONObject = store("config")?.let { runCatching { JSONObject(it) }.getOrNull() } ?: JSONObject()
    private fun cards(): JSONArray = store("cards")?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()
    private fun sessions(): JSONArray = store("sessions")?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()

    private fun authed(session: IHTTPSession): Boolean {
        val h = session.headers["authorization"] ?: return false
        return h.startsWith("Bearer ") && tokens.contains(h.removePrefix("Bearer "))
    }

    private fun body(session: IHTTPSession): String {
        val len = session.headers["content-length"]?.toIntOrNull() ?: 0
        if (len <= 0) return ""
        val buf = ByteArray(len)
        var off = 0
        while (off < len) {
            val n = session.inputStream.read(buf, off, len - off)
            if (n < 0) break
            off += n
        }
        return String(buf, 0, off, Charsets.UTF_8)
    }

    private fun sha256(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun login(session: IHTTPSession): Response {
        val req = JSONObject(body(session))
        val cfg = config()
        val hash = cfg.optString("adminPasswordHash").takeIf { it.isNotEmpty() && it != "null" }
        val pw = req.optString("password")
        if (req.optBoolean("setup")) {
            if (hash != null) return err(Response.Status.FORBIDDEN, "已设置过密码")
            if (pw.length < 4) return err(Response.Status.BAD_REQUEST, "密码至少 4 位")
            cfg.put("adminPasswordHash", sha256(pw)).put("updatedAt", System.currentTimeMillis())
            app.store.put("config", cfg.toString())
            toDevice(JSONObject().put("type", "config").put("config", cfg).toString())
        } else if (hash == null || sha256(pw) != hash) {
            return err(Response.Status.UNAUTHORIZED, "密码错误")
        }
        val token = UUID.randomUUID().toString()
        tokens.add(token)
        return json(mapOf("token" to token))
    }

    private fun getConfig(session: IHTTPSession): Response {
        if (!authed(session)) {
            val hash = config().optString("adminPasswordHash")
            return if (hash.isEmpty() || hash == "null") json(mapOf("setupRequired" to true))
            else err(Response.Status.UNAUTHORIZED, "未登录")
        }
        return json(mapOf("config" to maskConfig(config())))
    }

    private fun putConfig(session: IHTTPSession): Response {
        if (!authed(session)) return err(Response.Status.UNAUTHORIZED, "未登录")
        val patch = JSONObject(body(session))
        val cfg = config()
        merge(cfg, patch)
        cfg.put("updatedAt", System.currentTimeMillis())
        app.store.put("config", cfg.toString())
        toDevice(JSONObject().put("type", "config").put("config", cfg).toString())
        toAdmins(JSONObject().put("type", "config").put("config", maskConfig(cfg)).toString())
        return json(mapOf("config" to maskConfig(cfg)))
    }

    /** 深合并；apiKey 含 **** 视为未修改，保留旧值。 */
    private fun merge(base: JSONObject, patch: JSONObject) {
        for (k in patch.keys()) {
            val v = patch.get(k)
            if (v is JSONObject && base.optJSONObject(k) != null) {
                val sub = base.getJSONObject(k)
                if (k in listOf("llm", "asr", "tts", "embedding") && v.optString("apiKey").contains("****")) {
                    v.remove("apiKey")
                }
                merge(sub, v)
            } else if (v != JSONObject.NULL) {
                base.put(k, v)
            }
        }
    }

    private fun maskConfig(cfg: JSONObject): JSONObject {
        val out = JSONObject(cfg.toString())
        for (k in listOf("llm", "asr", "tts", "embedding")) {
            val sub = out.optJSONObject(k) ?: continue
            val key = sub.optString("apiKey")
            sub.put("apiKey", when {
                key.isEmpty() -> ""
                key.length <= 8 -> "****"
                else -> key.take(4) + "****" + key.takeLast(4)
            })
        }
        return out
    }

    private fun upsertCard(session: IHTTPSession): Response {
        if (!authed(session)) return err(Response.Status.UNAUTHORIZED, "未登录")
        val card = JSONObject(body(session)).getJSONObject("card")
        val arr = cards()
        val id = card.optString("id")
        var replaced = false
        for (i in 0 until arr.length()) {
            if (arr.getJSONObject(i).optString("id") == id) { arr.put(i, card); replaced = true; break }
        }
        if (!replaced) arr.put(card)
        app.store.put("cards", arr.toString())
        val msg = JSONObject().put("type", "memory").put("op", "upsert").put("card", card).toString()
        toDevice(msg); toAdmins(msg)
        return json(mapOf("ok" to true))
    }

    private fun deleteCard(session: IHTTPSession): Response {
        if (!authed(session)) return err(Response.Status.UNAUTHORIZED, "未登录")
        val id = session.parameters["id"]?.firstOrNull() ?: return err(Response.Status.BAD_REQUEST, "缺少 id")
        val arr = cards()
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val c = arr.getJSONObject(i)
            if (c.optString("id") != id) out.put(c)
        }
        app.store.put("cards", out.toString())
        val msg = JSONObject().put("type", "memory").put("op", "delete").put("id", id).toString()
        toDevice(msg); toAdmins(msg)
        return json(mapOf("ok" to true))
    }

    private fun deleteSession(session: IHTTPSession): Response {
        if (!authed(session)) return err(Response.Status.UNAUTHORIZED, "未登录")
        val id = session.parameters["id"]?.firstOrNull() ?: return err(Response.Status.BAD_REQUEST, "缺少 id")
        val arr = sessions()
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val s = arr.getJSONObject(i)
            if (s.optString("id") != id) out.put(s)
        }
        app.store.put("sessions", out.toString())
        return json(mapOf("ok" to true))
    }

    private fun update(session: IHTTPSession): Response {
        if (!authed(session)) return err(Response.Status.UNAUTHORIZED, "未登录")
        val len = session.headers["content-length"]?.toIntOrNull() ?: 0
        if (len <= 0 || len > 40 * 1024 * 1024) return err(Response.Status.BAD_REQUEST, "包大小非法")
        val buf = ByteArray(len)
        var off = 0
        while (off < len) {
            val n = session.inputStream.read(buf, off, len - off)
            if (n < 0) break
            off += n
        }
        val hash = app.update.install(buf)
        toDevice(JSONObject().put("type", "cmd").put("cmd", JSONObject().put("cmd", "reload")).toString())
        // 看门狗：30 秒内新包未上报状态则自动回滚
        main.postDelayed({
            val st = store("status")?.let { runCatching { JSONObject(it) }.getOrNull() }
            if (st == null || st.optString("bundleHash") != hash) {
                if (app.update.rollback()) {
                    toDevice(JSONObject().put("type", "cmd").put("cmd", JSONObject().put("cmd", "reload")).toString())
                }
            }
        }, 30000)
        return json(mapOf("hash" to hash))
    }

    // ---------- 云代理（绕 WebView/浏览器 CORS，与 vite cloudProxyPlugin 同契约） ----------
    private fun cloudProxy(session: IHTTPSession, uri: String): Response {
        val m = Regex("^/cloud-proxy/([a-zA-Z0-9.-]+(?::\\d{1,5})?)(/.*)?$").find(uri)
            ?: return err(Response.Status.BAD_REQUEST, "代理地址非法")
        val authority = m.groupValues[1]
        val path = m.groupValues[2].ifEmpty { "/" }
        val pm = Regex("^(.+):(\\d{1,5})$").find(authority)
        val host = pm?.groupValues?.get(1) ?: authority
        val port = pm?.groupValues?.get(2)?.toInt() ?: 443
        val scheme = if (pm != null) "http" else "https"
        // 只允许公网域名或局域网 IP，防 SSRF 到本机服务
        if (host == "localhost" || host == "127.0.0.1" || host == "0.0.0.0" || host.endsWith(".local"))
            return err(Response.Status.FORBIDDEN, "不允许代理本机")
        val query = session.queryParameterString?.takeIf { it.isNotEmpty() }?.let { "?$it" } ?: ""
        val url = java.net.URL("$scheme://$authority$path$query")
        val method = session.method.name
        // 读请求体（POST JSON / zip 等）
        val len = session.headers["content-length"]?.toIntOrNull() ?: 0
        val body = if (len > 0) ByteArray(len).also { buf ->
            var off = 0
            while (off < len) { val n = session.inputStream.read(buf, off, len - off); if (n < 0) break; off += n }
        } else null
        val idempotent = method == "GET" || method == "HEAD"
        var lastErr: Exception? = null
        for (attempt in 0..2) {
            try {
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = method
                conn.connectTimeout = 15000; conn.readTimeout = 60000
                conn.instanceFollowRedirects = true
                for ((k, v) in session.headers) {
                    val lk = k.lowercase()
                    if (lk in listOf("host", "connection", "proxy-connection", "origin", "referer", "content-length", "accept-encoding")) continue
                    conn.setRequestProperty(k, v)
                }
                conn.setRequestProperty("Host", authority)
                conn.setRequestProperty("Accept-Encoding", "identity")
                if (body != null) { conn.doOutput = true; conn.outputStream.use { it.write(body) } }
                val code = conn.responseCode
                if (idempotent && code in listOf(502, 503, 504) && attempt < 2) {
                    runCatching { conn.errorStream?.close() }; runCatching { conn.disconnect() }
                    Thread.sleep(400L * (attempt + 1)); continue
                }
                val stream = if (code >= 400) conn.errorStream ?: conn.inputStream else conn.inputStream
                val mime = conn.contentType ?: "application/octet-stream"
                val resp = newChunkedResponse(Response.Status.lookup(code) ?: Response.Status.OK, mime, stream)
                for ((k, vs) in conn.headerFields) {
                    if (k == null || k.lowercase() in listOf("transfer-encoding", "connection", "content-length", "content-encoding")) continue
                    for (v in vs) resp.addHeader(k, v)
                }
                return resp
            } catch (e: Exception) {
                lastErr = e
                val retryable = e is java.net.SocketException || e is java.net.SocketTimeoutException || e is java.net.UnknownHostException
                if (!idempotent || !retryable || attempt >= 2) break
                Thread.sleep(400L * (attempt + 1))
            }
        }
        return err(Response.Status.INTERNAL_ERROR, "代理失败: ${lastErr?.message ?: "unknown"}")
    }

    /** 调试：上传 WAV(16k mono) → 原生按实时速率喂 KWS/VAD，验证唤醒链路（无需人对着喊）。 */
    private fun injectPcm(session: IHTTPSession): Response {
        val len = session.headers["content-length"]?.toIntOrNull() ?: 0
        if (len <= 44 || len > 8 * 1024 * 1024) return err(Response.Status.BAD_REQUEST, "wav 大小非法")
        val buf = ByteArray(len)
        var off = 0
        while (off < len) { val n = session.inputStream.read(buf, off, len - off); if (n < 0) break; off += n }
        val f = File(app.cacheDir, "inject.wav")
        f.writeBytes(buf)
        app.audio.injectPcm(f.absolutePath)
        return json(mapOf("ok" to true, "bytes" to len))
    }

    // ---------- 静态 ----------
    private fun static(uri: String): Response {
        var path = uri.removePrefix("/")
        if (path.isEmpty()) path = "index.html"
        if (path.contains("..")) return err(Response.Status.FORBIDDEN, "forbidden")
        val dir = app.update.webDir()
        val f = File(dir, path)
        if (!f.isFile) return err(Response.Status.NOT_FOUND, "not found")
        if (path == "index.html") {
            // 注入界面包 hash，供状态页与更新看门狗使用
            val html = f.readText().replace("<head>", "<head><script>window.__bundleHash=\"${app.update.currentHash()}\";</script>")
            val r = newFixedLengthResponse(Response.Status.OK, "text/html; charset=utf-8", html)
            // index.html 永不缓存：热更新/重装后必须拿到新入口，否则 WebView 会继续引用旧 hash JS
            r.addHeader("Cache-Control", "no-store")
            return r
        }
        val mime = when (f.extension.lowercase()) {
            "js", "mjs" -> "application/javascript"
            "css" -> "text/css"
            "html" -> "text/html; charset=utf-8"
            "json" -> "application/json"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "gif" -> "image/gif"
            "svg" -> "image/svg+xml"
            "woff2" -> "font/woff2"
            "vrm" -> "model/gltf-binary"
            "mp3" -> "audio/mpeg"
            "wav" -> "audio/wav"
            else -> "application/octet-stream"
        }
        return newFixedLengthResponse(Response.Status.OK, mime, FileInputStream(f), f.length())
    }

    private fun json(map: Map<String, Any?>): Response =
        newFixedLengthResponse(Response.Status.OK, "application/json", JSONObject(map).toString())

    private fun err(status: Response.Status, msg: String): Response =
        newFixedLengthResponse(status, "application/json", JSONObject().put("error", msg).toString())

    private fun cors(r: Response): Response {
        r.addHeader("Access-Control-Allow-Origin", "*")
        r.addHeader("Access-Control-Allow-Headers", "Authorization, Content-Type")
        r.addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        return r
    }

    companion object { private const val TAG = "HttpServer" }
}
