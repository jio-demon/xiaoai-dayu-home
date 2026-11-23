package com.xiaoai.shell

import android.app.Application
import android.content.Context

/** 全局单例：kv 存储 / 界面包管理 / HTTP+WS 服务 / 音频引擎。 */
class App : Application() {
    lateinit var store: Store
    lateinit var update: UpdateManager
    lateinit var server: HttpServer
    lateinit var audio: AudioEngine
    lateinit var bridge: Bridge

    override fun onCreate() {
        super.onCreate()
        instance = this
        store = Store(this)
        update = UpdateManager(this, store)
        bridge = Bridge(this)
        audio = AudioEngine(this, bridge, store)
        server = HttpServer(this)
        // timeout=0：禁用 socket 读超时。NanoHTTPD 默认 5s 会把空闲 WebSocket 掐断（SocketTimeoutException）
        server.start(0, false)
    }

    companion object {
        lateinit var instance: App
            private set
        fun ctx(): Context = instance.applicationContext
    }
}
