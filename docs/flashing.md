# LX04 刷机指南（小爱触屏音箱 → 大肥鱼之家）

## 硬件事实
- 型号：小米小爱触屏音箱 LX04；SoC：MTK MT8167（4×A53）；RAM 1GB；屏幕 800×480；Android 8.1。
- 存储为 eMMC，**老化常见**：读回异常慢/坏块多的机器不建议刷机，直接换机。
- 1GB RAM + 旧 Mali GPU 是渲染降级策略（2.5D）存在的原因。

## 准备
1. Windows 电脑 + USB 数据线（能传数据，不是纯充电线）。
2. 安装 MTK 驱动（BROM/Preloader VCOM）；Zadig 给 BROM 接口装 libusb 驱动（mtkclient 需要）。
3. 工具二选一：
   - **SP Flash Tool**（图形化，推荐）+ MTK_AllInOne_DA.bin；
   - **mtkclient**（命令行，`pip install mtkclient`，GitHub bkerler/mtkclient）。
4. 固件：社区 **Hikaru 官改**（基于原厂精简、含 root、可装第三方桌面），
   下载对应 LX04 版本，解压得到 scatter 文件与各分区 img。

## 进入 BROM 模式
关机 → **按住音量+** → 插 USB。设备管理器出现 MediaTek USB Port（短暂几秒）。
无反应时：换线/换口、长按电源 10s 强制关机再试；个别批次需拆机短接测试点（谨慎）。

## 第一步永远是备份（G1）
```powershell
powershell -File tools\stage0\backup.ps1
```
- 必须单独备份 `proinfo`、`nvram`、`nvdata`（串号/基带/WiFi MAC，丢了很难救）。
- 再做全量 eMMC 读回（`mtk rl`）兜底。备份双份存放。

## 不刷机先试装（推荐第一步）
如果机器已能打开 ADB（官改固件/开发者选项/网络 ADB），可以**不刷机直接装 APK** 体验：
```powershell
# USB：插线后 adb devices 出现设备即可
# 或网络：adb connect <设备IP>:5555
adb install -r F:\ai\xiaoai\release\dayu-home-v0.2.0.apk
adb shell am start -n com.xiaoai.shell/.MainActivity
```
- 首次启动会请求麦克风权限，允许即可。
- 界面自带「大肥鱼」本地唤醒（sherpa-onnx KWS 已内置）+ 点麦克风说话 + 全套房间/天气/记忆功能。
- 想开机直达：`adb shell cmd package set-home-activity com.xiaoai.shell/.MainActivity`
  （恢复原桌面：`adb shell cmd package set-home-activity <原桌面包名>/<Activity>`，
  原桌面可用 `adb shell cmd package resolve-activity --brief -c android.intent.category.HOME` 查询后再设置）。
- 卸载回原样：`adb uninstall com.xiaoai.shell`。
- 原厂未 root 固件若装不上/无法设默认桌面，再走下面的刷机流程。

## 重新打包 APK（改了代码之后）
```powershell
pwsh -NoProfile -File apps\device-shell\build-apk.ps1
```
本机工具链已就位：`tools\android\jdk`（JDK17）+ `tools\android\gradle`（8.7）+ `C:\Android`（SDK34），
产物自动复制到 `release\dayu-home-v0.2.0.apk`。只改 Web 界面时也可以不打 APK——
管理页「固件更新」上传 zip 热更新即可（zip 内容 = apps\web\dist 目录打包）。

## 真机踩坑记录（LX04 / Android 8.1 / WebView 61，2026-11 实测）
- **WebView 只有 Chrome 61**：不支持动态 `import()`、async generator。Web 构建已启用
  `@vitejs/plugin-legacy`（babel + core-js 双包），旧 WebView 自动走 SystemJS legacy 包。
  控制台里 modern 包的 `SyntaxError` 是**预期噪音**，随后 legacy 包接管，勿慌。
- **index.html 必须 no-store**：HttpServer 已加 `Cache-Control: no-store`，否则重装/热更新后
  WebView 缓存旧入口，继续引用旧 hash JS 黑屏。build-apk.ps1 也会先清空 assets/web 再复制。
- **NanoHTTPD 默认 5s socket 读超时会掐断空闲 WebSocket**：App.kt 用 `server.start(0, false)`
  禁用超时，/ws 长连接才稳定（否则前端反复重连、管理页实时状态失效）。
- **3D 自动降级**：Mali GPU + 1GB RAM 跑不动 WebGL 场景时自动切 2.5D（实测 ~41fps，剩余内存 ~250MB），
  也可在 ⚙ 设置里手动锁定渲染模式。
- **权限弹窗**：部分官改 ROM 每次冷启动弹「授予哪些权限」审查框，点「继续」即可；
  可用 `adb shell input tap 752 432` 远程点掉（800x480 屏）。
- **重装 APK 后界面还是旧的**：内置 Web 包解压到 files/bundles/builtin 后会一直复用。
  UpdateManager 现在对比 packageInfo.lastUpdateTime 与 .stamp，APK 升级后自动重新解压内置包
  （logcat 出现 `builtin bundle refreshed` 即生效）。
  但若 SQLite 中已有热更新 `bundle` 指针且目标目录有效，webDir() 会优先使用该热更新包；
  仅覆盖安装 APK 不一定能替换当前界面，需通过管理页上传新 zip 或明确处理旧指针。
- **音响屏幕显示「PC 模拟」且管理地址为 127.0.0.1**：回环地址本身正常，表示 WebView
  正在访问音响自己的 HttpServer；它不能作为手机管理地址。旧 Web 代码可能在原生对象尚未
  可见时就缓存了 MockBridge，导致原生音频服务仍工作而页面却走浏览器模拟。现版在设备回环页
  最多等待原生桥 3 秒，未连接时显示错误而不是静默降级；原生存储读取失败也不会写回空默认值。
  此修复已通过构建、单测和桌面 WebView 场景回归，具体真机注入时序仍需部署后核验。
  上传 zip 后服务端会自动重载；若仍报 XiaoAiBridge 缺失，再收集 MainActivity/logcat 证据排查薄壳。
- **Chrome 61 没有 AbortController**：core-js 只补 JS 内建不管 DOM API，天气轮询/连通测试会
  `ReferenceError` 直接白屏。`src/net/domPolyfill.ts` 提供 AbortController/AbortSignal 垫片，
  在 main.tsx 首行引入（旧 WebView fetch 忽略 signal，可接受）。
- **Chrome 61 没有 flex gap / inset / #RRGGBBAA**：设置面板曾整片叠字。styles.css 已全部给
  margin / top-left-right-bottom / rgba() 回退；面板本身 overflow-y:auto 上下滑动，不必一屏塞下。
  回归脚本：`node tools/e2e-settings-layout.mjs`（模拟无 gap 环境断言零重叠）。
- **电脑开 http://<设备IP>:8080/#/admin 保存没反应**：旧版管理页认不出自己是被设备伺服的，
  落进「PC 模拟」模式把配置存进了浏览器 localStorage。AdminApp 现在检测到页面来自局域网 IP
  时自动直连该设备（顶栏显示「设备管理页（真机）」），保存走 PUT /api/config → WS 推给设备。
  回归脚本：`node tools/e2e-admin-sync.mjs`（管理端保存→设备页实时收到）。
- **麦克风被原厂 MiVpmService 抢走**：官改 ROM 里 `mivpm` 常驻服务会抢唤醒事件。已永久禁用：
  `/vendor/etc/init/hw/init.project.rc` 的 `service mivpm` 块加了一行 `disabled`
  （备份在同目录 init.project.rc.bak），重启后依然生效。
  副作用：系统应用会刷「Waiting for service mivpmserver」日志，无害。
- **唤醒/录音全废的真正根因①——采集参数不对**：LX04 的麦克风是 **ES7243 双 ADC（i2c-1 0x13）
  → MT8167 TDM（pcmC0D6c）**，不是 ADDA/PGA 内置 codec 路径！普通
  `AudioSource.MIC + CHANNEL_IN_MONO` 会被 HAL 路由到假麦克风，读出来是周期性数字噪声
  （rms≈0.45、lag3 相关 0.977）。必须复刻原厂 MiVpmService：
  **`AudioSource.VOICE_RECOGNITION(6) + index mask 0x1000C`（FRONT|BACK|0x10000，3ch=2mic+1ref）**，
  然后取 ch0/ch1。注意 `getMinBufferSize` 对该 mask 返回 -2，但 AudioRecord 构造能成功；
  position mask（如 0x10030）反而会被拒。AudioEngine.startMic 已默认走此路径（失败回退 mono），
  并带 4x 软件增益（ES7243 默认 PGA 偏低，远讲 rms≈0.03）。mixer_paths.xml 的 PGA/DMIC 改动
  与此无关（mic_type=dmic 时根本不加载它）。
- **真正根因②——TDM pinmux 被 extamp 状态顶掉**：sound 驱动的 pinctrl 有三态
  default/extamp_on/extamp_off。开机默认态把 CMDAT0/1、CMMCLK、CMPCLK（pin100-103）mux 到
  func5=TDM；一旦 HAL 切到 extamp_on/off（只 mux SPI_MO 功放脚），**TDM 四个脚全部变成
  UNCLAIMED 悬空**，ES7243 时钟/数据断开 → 采到数字垃圾。检查：
  `grep "odm:sound current" /sys/kernel/debug/pinctrl/pinctrl-handles`（应为 default）
  + `pinmux-pins` 里 pin100-103 应挂 func5。**修复：重启设备**（声卡驱动 unbind/rebind
  会失败且无法恢复，别试）。重启后不播放音频时状态保持 default，采集正常。
- **根因②的永久修复——补丁 DTBO（2026-11-21）**：给 odmdtbo_a 分区里 blob1
  （mediatek,mt8167-mt6392）的 `audexampon`/`audexampoff` 节点各插入一个
  `pins_extamp_default { pinmux = <0x6405 0x6505 0x6605 0x6705>; }` 子节点，
  让 extamp 两态也保持 TDM 四脚 mux。同时更新三处长度字段：DTBO 头 total_size(+0x04)、
  0x200 表 total_size(+0x204)、条目 size(+0x224)，以及 blob1 FDT 头 totalsize/stringsOff/structSize。
  工具与镜像：`tools/dtb/odmdtbo_a.backup.img`（原始备份）、`odmdtbo_a.patched.img`（已刷入）。
  刷法：`dd if=patched of=/dev/block/mmcblk0p13`（slot_a；p14=slot_b 未动）。
  ⚠️ 本机刷后未能开机（网络不通），原因待查——可能 LK 校验 dtbo 或条目表还有未知字段。
  救砖走 BROM + mtkclient 写回备份：
  `mtk w odmdtbo_a F:\ai\xiaoai\tools\dtb\odmdtbo_a.backup.img`（需先装 libusb/WinUSB 驱动，
  设备关机按住音量+插 USB 进 BROM；本机已 pip 装好 mtkclient 2.1.4）。
  若只是卡开机循环，也可尝试长按电源 10s 强制断电再上电。
- **sherpa-onnx v2 KWS 配置**：v2.x 只认 `keywordsFile`（assets 相对路径），v1 的 `keywordsBuf`
  会被静默忽略；wenetspeech L 模型建模单元是 `ppinyin`（带声调拼音）不是 `cjkchar`。
  keywords.txt：`d à f éi y ú :2.0 #0.18 @大肥鱼`，阈值已放宽到 0.12。
- **录音收尾兜底**：silero VAD 之外加了「无人声 6s / 有人声 15s」超时 + JS 侧 20s 看门狗，
  Chrome61 fetch 不支持 AbortSignal，ASR 用 Promise.race 25s 超时，任何一环挂了都能回 idle。
- **native Vad/OnlineStream 非线程安全**：调试注入线程和 mic-loop 并发调用曾直接 SIGSEGV。
  现在 KwsEngine 所有 native 入口串行化（nativeLock），注入线程唤醒后只写 PCM 缓冲，
  VAD/收尾统一由 mic-loop 负责。
- **无麦克风远程联调**：`curl -X POST --data-binary "@tools/assets/wake-question.wav"
  http://<设备IP>:8080/api/debug/inject-pcm` 可把 WAV 当麦克风输入走完整
  唤醒→录音→ASR→LLM→TTS 链路（tools/assets/ 下有合成好的测试语音）。

## 刷入
```powershell
powershell -File tools\stage0\flash.ps1 -FirmwareDir <固件目录>
```
- SP Flash Tool：**Download Only**。绝对不要选 Format All + Download（会抹掉 proinfo/nvram）。
- 刷完开机，`adb devices` 验证，再装薄壳 APK：
  `adb install apps\device-shell\app\build\outputs\apk\debug\app-debug.apk`
- 把「大肥鱼之家」设为默认桌面（HOME），实现开机直达。

## 救砖
- 卡开机：BROM 仍在 → 用备份的分区 img 逐个 `mtk w` 写回。
- BROM 都没了：短接测试点强进 BROM；再不行就是硬件级故障。
- eMMC 写入大量报错：存储寿命到了，停止折腾。

## 2026-11-22 救砖记录（dtbo 补丁导致黑屏）
- 起因：为修麦克风 TDM 引脚复用，直接改了 odmdtbo_a 分区 → LK 校验 dtbo 失败 → 无限重启黑屏。
- **教训：LX04 的 dtbo 有签名校验，不能直接改分区。麦克风问题改用内核模块/避免播放后录音等软方案。**
- 救砖目标：把 `tools/dtb/odmdtbo_a.backup.img`（16MB 完好备份）写回 odmdtbo_a（mmcblk0p13）。
- USB 行为：插电瞬间 BROM PID_0003（2-5 秒）→ Preloader PID_2000（约 60 秒，SBC+DAA 锁定，SEND_DA 报 SIG_VERIFY_FAIL）→ 消失循环。
- 关键修复：给 PID_0003 预装 WinUSB 驱动（`tools/dtb/brom-winusb/MTK_BROM_WinUSB.inf`，oem62.inf，
  用自签证书 EB99E23D… 签 catalog，证书已入 Root+TrustedPublisher；pnputil /remove-device 清掉旧 usbser 绑定）。
  这样 BROM 一出现就是 libusb 设备，mtkclient 可直接握手 + kamakiri（MT8167 var1=0xCC）。
- 救砖脚本：`tools/dtb/restore-usb.py`（先运行待命，再插线；自动握手→kamakiri→DA→写回→读回校验 sha256）。
  备用双通道脚本：`tools/dtb/restore-dual.py`（WinUSB 失败时走 COM 串口注入）。
- 成功标志：`tools/dtb/usb-restored.flag` 存在且内容 = 备份 sha256 f3d3ad7d…。
- 恢复后：拔线等 5 秒，不按任何键插电正常开机。

## 2026-11-22 网上主板资料调研（救砖可行性）
来源（均可访问，已读正文）：
- 知乎《小爱触屏音箱LX04刷机及eMMC相关操作简单指南》 https://zhuanlan.zhihu.com/p/2032743786808390454
- 恩山《LX04闪存故障损坏后如何最大可能恢复原厂功能》 https://www.right.com.cn/forum/thread-8473947-1-1.html
- 什么值得买 lx04 刷机教程①② https://post.smzdm.com/p/akk3k89r/ 、 https://post.smzdm.com/p/a6053q0e/
- GitHub Orbick/-LX04- README（raw 可读）

**关键结论：进 MTK 下载模式靠「音量+」按键，不需要短接 eMMC！**
三处独立来源一致描述同一手法（本机此前一直只抓到 PID_2000，从未进 BROM，极可能就是没按音量+）：
1. 先打开 mtkclient（或 SP Flash Tool 点 Download，界面全灰待命）。
2. 音箱关机/断电状态，**按住「音量+」键不放**。
3. 插 MicroUSB 连电脑 → 听到一声连接声后马上断开声，软件提示 Port found / Phone detected，但会连不上。
4. **拔线，仍按住音量+，再插一次** → 这次软件正常连接（进入 BROM PID_0003 下载模式）。
5. 连接成功后才松开音量+。
- 恩山原话：「先打开MTK Client，然后音箱关机状态下按住音量加，连接电脑…此时软件会提示Phone detected，但…等了很久也无法连接…断开usb线，再次重复上述操作（按住音量加，usb连接电脑），此时软件就能正常连接并读取分区了。」
- 知乎原话：「持续按住音量增+按键不放…插入…提示Port found，拔出数据线，同时不要松开…再次插入…提示设备已连接成功…这时就可以…读Flash全盘备份/写Flash恢复指定分区。」
- GitHub README 亦提到「刷入系统后…可能插上后要按+音量键」。

对本机的意义：
- 本机是 dtbo 软砖，eMMC 完好、SoC 活着，属于「能救」范畴。之前纯 USB 自动探测只看到 preloader(2000) 循环，
  很可能就是因为没有用音量+强制停在 BROM。**下一步应让用户用「音量+ + 两次插拔」手法配合 restore-usb.py 待命脚本试一次。**
- 若音量+能进 BROM(0003)，WinUSB 驱动已预装，kamakiri(MT8167 var1=0xCC) 即可绕过 SBC/DAA 写回 odmdtbo_a 备份。
- 注意：本机安全锁 SBC+DAA 开，普通 SP Flash Tool 的 DA 会被 SIG_VERIFY_FAIL 挡；必须走 mtkclient+kamakiri，
  不能指望一键线刷包/SPFT 直接刷（那些对未锁机器有效）。
- 兜底：若音量+也进不了 BROM，才考虑 eMMC 编程器离线写回（需拆焊 BGA153，风险高）；或换二手 LX04（最省心）。
- 短接 eMMC CLK/DAT0 仍是最后手段且本机无明确丝印测试点，不推荐让用户赌。
