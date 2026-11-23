package com.xiaoai.shell

import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.util.Locale

/** JS ↔ Kotlin 桥：与 apps/web/src/bridge/native.ts 契约一一对应。 */
class Bridge(private val app: App) {
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var webView: WebView? = null

    fun attach(wv: WebView) { webView = wv }

    /** Kotlin → JS 事件（kws/vad/audioLevel/mic/config/cmd）。 */
    fun emit(e: JSONObject) {
        val json = JSONObject.quote(e.toString())
        main.post { webView?.evaluateJavascript("window.__onNativeEvent && window.__onNativeEvent($json)", null) }
    }

    fun audioDone(cb: Int) {
        main.post { webView?.evaluateJavascript("window.__audioDone && window.__audioDone($cb)", null) }
    }

    @JavascriptInterface
    fun getBlob(key: String): String? = app.store.get(key)

    @JavascriptInterface
    fun putBlob(key: String, value: String) { app.store.put(key, value) }

    @JavascriptInterface
    fun playAudio(json: String) { app.audio.playAudio(json) }

    @JavascriptInterface
    fun stopAudio() { app.audio.stopAudio() }

    @JavascriptInterface
    fun startMic(mode: String) { app.audio.startMic(mode) }

    @JavascriptInterface
    fun stopMic() { app.audio.stopMic() }

    @JavascriptInterface
    fun readRecordedPcm(): String? = app.audio.readRecordedPcm()

    @JavascriptInterface
    fun getDeviceInfo(): String {
        val wm = app.applicationContext.getSystemService(WifiManager::class.java)
        val ipInt = wm?.connectionInfo?.ipAddress ?: 0
        val ip = String.format(Locale.US, "%d.%d.%d.%d", ipInt and 0xff, ipInt shr 8 and 0xff, ipInt shr 16 and 0xff, ipInt shr 24 and 0xff)
        return JSONObject().put("ip", ip).put("version", BuildConfig.VERSION_NAME).toString()
    }
}
