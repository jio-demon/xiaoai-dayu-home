# device-shell：LX04 Android 薄壳

Kotlin 薄壳 = Kiosk WebView + 本地 Web 服务（NanoHTTPD/NanoWSD :8080）+ SQLite kv（Keystore 加密 config）
+ 音频（AudioRecord 16k / MediaPlayer）+ 可选 sherpa-onnx 本地唤醒 + zip 热更新。

## 构建（本机工具链已就位：tools\android\jdk + tools\android\gradle + C:\Android SDK34）
直接 `pwsh -NoProfile -File build-apk.ps1`，产物在 `release\dayu-home-v0.2.0.apk`（约 40MB，含本地唤醒）。
以下手动步骤仅在换机器时需要：
1. 安装 JDK 17、Android SDK（platform 34 + build-tools）、Gradle 8.7+。
2. 「大肥鱼」语音唤醒已内置（sherpa-onnx 2.0.2 AAR + wenetspeech KWS int8 模型 + silero VAD，
   assets/kws/keywords.txt 已按拼音单元写好 `d à f éi y ú`）。如需更换唤醒词/模型：
   - 下载 sherpa-onnx Android AAR（Maven Central `com.k2fsa.sherpa.onnx:sherpa-onnx`，
     或 GitHub k2-fsa/sherpa-onnx Releases 的 `sherpa-onnx-*.aar`），放入 `app/libs/`。
   - 下载中文 KWS 模型 `sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01`，
     把 encoder/decoder/joiner.onnx、tokens.txt 放入 `app/src/main/assets/kws/`；
     silero_vad.onnx 同目录。用官方 `text2token.py` 把「大肥鱼」转成建模单元写入
     `assets/kws/keywords.txt`（脚本见 tools/stage0/fetch-models.ps1 的说明）。
   - AAR 或模型缺失时自动禁用 KWS，点麦克风说话仍可用。
3. `pwsh -NoProfile -File build-apk.ps1`（自动 npm run build 并复制 dist 到 assets/web）。
4. `adb install app/build/outputs/apk/debug/app-debug.apk`。

## 运行时结构
- `App`：单例装配 Store/UpdateManager/Bridge/AudioEngine/HttpServer。
- `MainActivity`：全屏 WebView 加载 `http://127.0.0.1:8080/`，注入 `XiaoAiBridge`；
  注册为 HOME 桌面候选，开机自启（BootReceiver + 前台服务 ShellService）。
- `HttpServer`：静态页（当前界面包）+ REST（login/config/memories/sessions/status/update）
  + `/ws` 中继（设备↔管理端；发给管理端的 config 自动掩码）。
- `UpdateManager`：zip 上传 → sha256 目录 → 切换指针 → 30s 看门狗未上报新包 hash 自动回滚；保留 3 份。
- `Store`：kv 表；`config` 文档以 `enc:` 前缀 + AES/GCM（Android Keystore）落盘。
- `AudioEngine`：KWS 常开模式 / 录音模式（silero VAD 优先，能量 VAD 兜底；静音 700ms 或 15s 截断）。
- `KwsEngine`：反射调用 sherpa-onnx，兼容多版本 API；任何缺失都优雅降级。

## 与 Web 的契约
见 `packages/protocol/src/index.ts`（BridgeApi / REST / WsMessage），
JS 侧实现 `apps/web/src/bridge/native.ts` 与 `apps/web/src/net/api.ts`。
