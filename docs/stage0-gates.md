# Stage 0 门槛（实机验证，未过不进 Stage 1）

| 门 | 内容 | 达标线 | 工具 |
|----|------|--------|------|
| G1 | 备份 + 刷机 + ADB | proinfo/nvram/全量 eMMC 备份双份；官改开机正常；adb 可见 | tools/stage0/backup.ps1、flash.ps1 |
| G2 | WebView 性能 | 3D FPS ≥ 24 持续 1 分钟；空闲内存 ≥ 200MB；30 分钟无崩溃 | 管理页状态页、dumpsys meminfo |
| G3 | 麦克风 + 唤醒 | KWS 20 次 ≥ 18 中；VAD 截断正常；打断可用 | 人工计数 + checklist |
| G4 | 端到端时延 | 唤醒→首句播报 p50 < 3s（10 次） | 秒表/录屏逐帧 |

执行顺序与逐项勾选见 `tools/stage0/checklist.md`。
任何一门失败：记录现象 → 修复 → 重测该门；eMMC 读回异常直接判定设备不适合改造。
