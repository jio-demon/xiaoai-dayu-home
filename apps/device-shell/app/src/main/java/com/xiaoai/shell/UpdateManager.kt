package com.xiaoai.shell

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.zip.ZipInputStream

/** Web 界面包管理：assets 内置包 → files/bundles/<hash>；上传 zip 热更新 + 保留 3 份可回滚。 */
class UpdateManager(private val ctx: Context, private val store: Store) {
    private val root = File(ctx.filesDir, "bundles")

    /** 当前界面目录；首次启动把 assets/web 解到 builtin。 */
    @Synchronized
    fun webDir(): File {
        val ptr = store.get("bundle")?.let { runCatching { JSONObject(it) }.getOrNull() }
        val hash = ptr?.optString("hash").orEmpty()
        if (hash.isNotEmpty()) {
            val d = File(root, hash)
            if (File(d, "index.html").isFile) return d
        }
        val builtin = File(root, "builtin")
        // APK 升级后 assets 内容变了但 files/bundles/builtin 还是旧解包 → 用 lastUpdateTime 戳判断重解
        val stamp = runCatching {
            ctx.packageManager.getPackageInfo(ctx.packageName, 0).lastUpdateTime
        }.getOrDefault(0L)
        val stampFile = File(builtin, ".stamp")
        val oldStamp = runCatching { stampFile.readText().trim().toLong() }.getOrDefault(-1L)
        if (!File(builtin, "index.html").isFile || oldStamp != stamp) {
            if (builtin.exists()) builtin.deleteRecursively()
            copyAssets("web", builtin)
            runCatching { stampFile.writeText(stamp.toString()) }
            Log.i("UpdateManager", "builtin bundle refreshed (stamp=$stamp)")
        }
        return builtin
    }

    fun currentHash(): String =
        store.get("bundle")?.let { runCatching { JSONObject(it).optString("hash") }.getOrNull() } ?: "builtin"

    /** 安装上传的 zip，返回 hash；非法包抛异常。 */
    @Synchronized
    fun install(zip: ByteArray): String {
        val hash = sha256(zip)
        val dir = File(root, hash)
        dir.mkdirs()
        ZipInputStream(zip.inputStream()).use { zis ->
            var entry = zis.nextEntry
            while (entry != null) {
                val out = File(dir, entry.name)
                // 防目录穿越
                if (!out.canonicalPath.startsWith(dir.canonicalPath + File.separator)) {
                    throw IllegalArgumentException("非法压缩包路径: ${entry.name}")
                }
                if (entry.isDirectory) out.mkdirs()
                else {
                    out.parentFile?.mkdirs()
                    FileOutputStream(out).use { zis.copyTo(it) }
                }
                zis.closeEntry()
                entry = zis.nextEntry
            }
        }
        if (!File(dir, "index.html").isFile) { dir.deleteRecursively(); throw IllegalArgumentException("压缩包缺少 index.html") }
        val prev = currentHash()
        store.put("bundle", JSONObject().put("hash", hash).put("prev", prev).put("ts", System.currentTimeMillis()).toString())
        prune()
        return hash
    }

    @Synchronized
    fun rollback(): Boolean {
        val ptr = store.get("bundle")?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return false
        val prev = ptr.optString("prev")
        if (prev.isEmpty() || prev == "builtin") { store.put("bundle", JSONObject().put("hash", "builtin").toString()); return true }
        if (!File(File(root, prev), "index.html").isFile) return false
        store.put("bundle", JSONObject().put("hash", prev).put("prev", "builtin").toString())
        return true
    }

    private fun prune() {
        val keep = setOf(currentHash(), "builtin")
        root.listFiles()?.filter { it.isDirectory && it.name !in keep }
            ?.sortedByDescending { it.lastModified() }?.drop(2)?.forEach { it.deleteRecursively() }
    }

    private fun copyAssets(path: String, out: File) {
        val list = ctx.assets.list(path) ?: return
        if (list.isEmpty()) {
            out.parentFile?.mkdirs()
            ctx.assets.open(path).use { input -> FileOutputStream(out).use { input.copyTo(it) } }
        } else {
            out.mkdirs()
            for (name in list) copyAssets("$path/$name", File(out, name))
        }
    }

    companion object {
        fun sha256(bytes: ByteArray): String =
            MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    }
}
