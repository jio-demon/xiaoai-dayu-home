# 开发环境搭建（PC 模拟，无需实机）

## 前置
- Node.js ≥ 20（本仓库在 v24 验证）。
- 国内网络：**所有 npm 命令加 `--registry=https://registry.npmmirror.com`**
  （官方源在本环境 ECONNRESET）。

## 安装与运行
```powershell
cd F:\ai\xiaoai
npm install --registry=https://registry.npmmirror.com
npm run dev
```
浏览器开两个标签页：
- `http://localhost:5173/#/device` —— 设备模拟（3D 房间 + 语音环 + 设置）
- `http://localhost:5173/#/admin` —— 管理页（与设备页 BroadcastChannel 实时同步）

PC 模拟能力：localStorage 存储、getUserMedia 录音 + 能量 VAD、Audio 播报、
「模拟唤醒」按钮；麦克风权限需允许。无 API key 时语音链路静默跳过 TTS，
文本对话仍可在管理页「让她说话」测试。

### 云端 API 代理（PC 模拟必读）
浏览器直接调 DeepSeek / 硅基流动会被 **CORS 跨域拦截**，表现为 `Failed to fetch`
（不是 key 错）。开发/预览服务器内置流式转发中间件（`apps/web/vite.config.ts`），
前端 `installCloudProxyFetch()` 自动改写 API 地址到同源代理，无需手动配置：
- `https://公网域名/...` → `/cloud-proxy/<host>/...`（https 转发）
- `http://局域网IP:端口/...` → `/cloud-proxy/<host>:<port>/...`（http 转发，
  支持自建 OpenAI 兼容网关，Base URL 直接填 `http://192.168.x.x:3065/v1` 即可）

localhost/127.* 与相对地址不代理。实机由原生壳请求云端，不走此代理。

管理页「模型与 API」每项都有**「连通测试」**按钮：真实发一次最小请求
（LLM 回「收到」/ ASR 0.3s 静音 / TTS「你好」/ embedding 一条文本），
显示耗时与具体错误。PC 模拟可直接测已保存的掩码 key；真机密钥不回传，
需重新粘贴完整 key 再测。

### 网页语音唤醒（实验）
设备页 ⚙ 设置 → 勾选「网页语音唤醒（实验）」→ 允许麦克风 → 说「大肥鱼」。
基于 Web Speech API（continuous + interim，zh-CN），带同音容错（大飞鱼/大非鱼等，
见 `apps/web/src/device/wakeMatch.ts`）；idle 才聆听，对话/播报中自动暂停，
页面隐藏时暂停、恢复可见续听。Chrome 依赖 Google 语音服务（国内常不可达，
网络错误×3 自动关开关并 toast，建议 Edge）；Firefox 等不支持时开关置灰。
带看门狗（8 秒无响应自动重启）与快速重启，聆听提示会实时显示「听到：…」便于排查。
开关存 localStorage（`xiaoai-web-wake`），仅本浏览器生效。实机不走此路径，
由原生 sherpa-onnx KWS 唤醒（模型下载：`tools/stage0/fetch-models.ps1`）。

## 校验
```powershell
npm run typecheck   # protocol + brain + web 三包
npm run test        # brain 52 例 + web 56 例
npm run build       # vite 目标 chrome64（兼容旧 WebView）
```


## E2E 回归脚本（可选）
先 `npm run dev`，另开终端：
```powershell
node tools/e2e-smoke.mjs      # 初始化→管理密码→四项连通测试→代理链路（假 key 应得 401）
node tools/e2e-voice.mjs      # 唤醒→录音→VAD→ASR 全链路，错误 toast 可见
node tools/e2e-wake-hit.mjs   # 注入假识别器，验证同音「大飞鱼」命中唤醒
node tools/e2e-webspeech.mjs  # 真实 Chromium Web Speech 可用性探测
node tools/e2e-volcano-ui.mjs # 火山 TTS 切换 UI + APP ID + 代理链路
```
依赖 `playwright-core`（devDependency）+ 本机 Playwright Chromium。

## 目录
- `packages/protocol`：类型契约（改这里要三端同步）。
- `packages/brain`：编排器/记忆宫殿/云服务商适配（vitest 单测）。
- `apps/web`：React 设备页 + 管理页 + three.js 场景。
- `apps/device-shell`：Kotlin 薄壳源码（本机无 SDK/JDK，需在开发机编译，见其 README）。
- `tools/`：Blender 素材脚本、Stage0 刷机/备份/模型脚本。

## 依赖注意
- `@pixiv/three-vrm` 锁定 **2.1.0**（2.1.1+ 需 three≥0.162；本项目 three 0.160
  以保留 WebGL1 兼容旧 Mali GPU）。升级 three 时同步升级 three-vrm。
- 构建目标 chrome64：可选链等新语法会被转译，勿改高。




