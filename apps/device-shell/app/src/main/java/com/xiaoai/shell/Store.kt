package com.xiaoai.shell

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** SQLite kv 文档存储；config 文档经 Keystore AES/GCM 落盘加密。 */
class Store(context: Context) : SQLiteOpenHelper(context, "xiaoai.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)")
    }
    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) { /* v1 无迁移 */ }

    @Synchronized
    fun get(key: String): String? {
        val raw = readableDatabase.rawQuery("SELECT v FROM kv WHERE k=?", arrayOf(key)).use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        } ?: return null
        if (key == "config" && raw.startsWith("enc:")) {
            return try { Crypto.decrypt(raw.removePrefix("enc:")) } catch (e: Exception) { null }
        }
        return raw
    }

    @Synchronized
    fun put(key: String, value: String) {
        val stored = if (key == "config") "enc:" + Crypto.encrypt(value) else value
        val cv = ContentValues().apply { put("k", key); put("v", stored) }
        writableDatabase.insertWithOnConflict("kv", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }
}
