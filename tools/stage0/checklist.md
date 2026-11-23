# Stage 0 实机验证清单（G1–G4）

> 任何一步不达标就停下修复，不要带病进入下一阶段。全程记录到本文件副本。

## G1 备份与刷机
- [ ] mtkclient/SP Flash Tool 能识别 BROM（关机按音量+ 插 USB）
- [ ] backup.ps1 完成：proinfo/nvram/nvdata/boot/system/userdata + 全量 eMMC 读回
- [ ] 备份已双份存放（电脑 + 网盘），并记录 eMMC 健康（读回速度是否异常慢/报错）
- [ ] 刷入 Hikaru 官改（Download Only，绝不 Format All）
- [ ] 开机正常、触屏/扬声器/麦克风原厂功能正常
- [ ] `adb devices` 可见；`adb shell getprop ro.build.version.release` = 8.1

## G2 WebView 性能
- [ ] 安装 device-shell APK，打开 `http://127.0.0.1:8080/`
- [ ] 3D 模式 FPS ≥ 24（管理页状态页读数，持续 1 分钟）
- [ ] 空闲内存 ≥ 200MB（`adb shell dumpsys meminfo com.xiaoai.shell`）
- [ ] 连续运行 30 分钟无崩溃/白屏；自动降级 2.5D 能正确触发与恢复
- [ ] 触屏点击物件有台词播报；设置面板可用

## G3 语音链路
- [ ] KWS 唤醒 20 次成功 ≥ 18 次（安静环境，1 米内）
- [ ] 录音 VAD 截断正常（说完停顿 0.7s 自动结束）
- [ ] ASR 识别中文正确率可接受（10 句常见指令）
- [ ] 播报打断（barge-in）：说话中点麦克风能立即停止

## G4 端到端时延
- [ ] 唤醒 → 首句播报 p50 < 3s（10 次取中位；DeepSeek+CosyVoice 流式逐句）
- [ ] 管理页（手机扫码）改配置 → 设备 5s 内生效
- [ ] 记忆闭环：聊一段 → 空闲 90s → 宫殿出现卡片 → 新对话能召回旧事
- [ ] 断电重启 → 自动进入大肥鱼桌面，配置/记忆完好
