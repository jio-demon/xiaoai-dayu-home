# 架构说明

```
┌────────────────────────── LX04（Android 8.1）──────────────────────────┐
│  Kotlin 薄壳 device-shell                                              │
│  ├─ MainActivity：Kiosk WebView（http://127.0.0.1:8080）+ XiaoAiBridge │
│  ├─ HttpServer(NanoWSD :8080)：静态界面包 + REST + /ws 中继             │
│  ├─ Store(SQLite kv)：config 经 Keystore AES/GCM 加密                  │
│  ├─ AudioEngine：AudioRecord 16k（KWS/录音）+ MediaPlayer 播报          │
│  ├─ KwsEngine：sherpa-onnx 反射调用（缺 AAR/模型自动禁用）              │
│  └─ UpdateManager：zip 热更新 + 30s 看门狗回滚 + 保留 3 包              │
└───────────────▲───────────────────────────────────────────────────────┘
                │ JS Bridge（同步 kv/音频/麦克风）+ 事件回调
┌───────────────┴─────────────── apps/web（React + three.js）───────────┐
│  #/device 设备页：3D 房间/角色、语音环、字幕、设置面板                   │
│  #/admin  管理页：API/角色/记忆宫殿/历史/状态/热更新（手机扫码访问）     │
│  scene/：程序化低模房间 + 占位角色（可换 VRM）+ FPS 自动降级 2.5D        │
│  net/：Link（真机 WsLink / PC BroadcastChannel）+ AdminApi（REST/Mock） │
└───────────────▲───────────────────────────────────────────────────────┘
                │ 纯云端 API（密钥只存设备本地）
┌───────────────┴─────────────── packages/brain（TS 编排器）────────────┐
│  Orchestrator：召回 → 流式 LLM → 逐句 TTS → 会话整理 → 夜间巩固         │
│  providers：DeepSeek(chat) / SiliconFlow(ASR/TTS/Embed) / DashScope 备选│
│  memory：六房间记忆宫殿（提取/召回/衰减/合并/归档）                     │
└──────────────────────────────────────────────────────────────────────┘
packages/protocol：三方唯一类型契约（BridgeApi/REST/WsMessage/AppConfig）
```

## 关键数据流
- **语音**：KWS 命中 → startMic(record) → VAD 截断 → readRecordedPcm → 云端 ASR
  → Orchestrator.handleUserText → 流式 LLM 逐句 → 云端 TTS → playAudio 队列播报。
- **打断**：说话中再点麦克风/唤醒 → abort + stopAudio + playGen 计数作废排队音频。
- **记忆宫殿**：会话结束（空闲 90s/手动）→ LLM 提取原子卡片（≤12 张）→ 按语义入六房间
  → 向量化。对话时召回：score = 0.6·cos + 0.2·importance + 0.2·strength，topK=6、
  ≤800 token，置顶 ≤3 必带，命中强化 +0.15。夜间 4 点：0.98^天 衰减、cos>0.92 合并、
  strength<0.15 归档阁楼。上下文只带召回块 + 最近 7 轮，长期记忆不占上下文。
- **管理链路**：手机浏览器 → REST(:8080) 登录（sha256 密码换 token）→ 改配置/记忆；
  /ws 把变更实时推给设备页；设备状态每 5s 上报。密钥对管理端永远掩码（****=未修改）。
- **PC 模拟**：普通开发页显式允许 MockBridge（localStorage/getUserMedia/Audio）+
  BroadcastChannel 跨标签页同步，`npm run dev` 即可完整体验（唤醒用按钮模拟）。
  音响自己的 `http://127.0.0.1:8080` 是内部回环入口，不是 PC 环境：启动先等待原生桥，
  超时则显示连接错误，禁止退回模拟存储。手机/电脑管理必须使用音响的局域网 IP。

## 降级与可靠性
- FPS EMA < 20 持续 4s → 自动切 2.5D（烘焙背景 + Canvas 精灵），设置里可切回。
- 界面包热更新：sha256 目录 + 指针切换；上传成功后服务端自动发送重载命令，
  30s 内新包未上报匹配 hash 的状态则自动回滚。已安装的热更新指针优先于 APK 内置包。
  看门狗只验证状态 hash，不能证明界面和语音功能正常，仍需冷重启后做真机验收。
- config 落盘 AES/GCM（Android Keystore）；管理密码只存 sha256。
