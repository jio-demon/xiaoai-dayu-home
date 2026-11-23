package com.xiaoai.shell

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 开机自启：拉起前台服务并进入大肥鱼桌面。 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        ShellService.start(context)
        context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
