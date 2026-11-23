plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.xiaoai.shell"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.xiaoai.shell"
        minSdk = 27          // Android 8.1（LX04 原厂版本）
        targetSdk = 28       // 保持旧行为：前台服务/存储/WebView 均按 8.1 语义
        versionCode = 1
        versionName = "0.1.0"
        // LX04 = MT8167 (armeabi-v7a)；只保留 arm 两架构，去掉 x86 减 60MB
        ndk { abiFilters += listOf("armeabi-v7a") } // MT8167 是 32 位 ARM；如换 64 位盒子再加 arm64-v8a
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

dependencies {
    // HTTP + WebSocket 服务（静态页 + REST + /ws 中继）
    implementation("org.nanohttpd:nanohttpd-websocket:2.3.1")
    // 可选：sherpa-onnx AAR 放入 app/libs 即启用本地唤醒词；缺失时自动禁用 KWS（仍可按键说话）
    implementation(fileTree("libs") { include("*.aar", "*.jar") })
}
