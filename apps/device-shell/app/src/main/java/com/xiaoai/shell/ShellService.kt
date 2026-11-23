package com.xiaoai.shell

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder

/** 前台服务：保活 HTTP/WS 服务与音频引擎（息屏场景）。 */
class ShellService : Service() {
    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH, "大肥鱼之家", NotificationManager.IMPORTANCE_MIN))
        val n = Notification.Builder(this, CH)
            .setContentTitle("大肥鱼之家")
            .setContentText("正在守护小房间…")
            .setSmallIcon(android.R.drawable.sym_def_app_icon)
            .build()
        startForeground(1, n)
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY
    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CH = "xiaoai-shell"
        fun start(ctx: Context) {
            ctx.startForegroundService(Intent(ctx, ShellService::class.java))
        }
    }
}
