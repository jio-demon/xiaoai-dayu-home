# G1 备份脚本：LX04 刷机前全量备份（eMMC 老化常见，备份是保命绳）
# 前置：已安装 mtkclient（pip install mtkclient）或 SP Flash Tool；设备进入 BROM 模式：
#   关机 → 按住音量+ → 插 USB（部分批次需短接测试点，见 docs/flashing.md）
# 本脚本只做「检查 + 提示 + 调用 mtkclient 读回」，不写任何分区。
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot ("backup_" + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Force -Path $out | Out-Null

Write-Host '== LX04 刷机前备份 ==' -ForegroundColor Cyan
Write-Host "备份目录：$out"
Write-Host '请确认：设备已关机，按住音量+ 插入 USB 进入 BROM 模式。' -ForegroundColor Yellow
Read-Host '确认设备已进入 BROM 后按回车继续（Ctrl+C 取消）'

$mtk = Get-Command mtk -ErrorAction SilentlyContinue
if (-not $mtk) {
    Write-Host '未找到 mtkclient。安装：pip install mtkclient（需要 libusb 驱动，见 docs/flashing.md）' -ForegroundColor Red
    Write-Host '或使用 SP Flash Tool 的 Readback 功能手动读回全部分区到上述目录。'
    exit 1
}

# 关键分区逐个读回（proinfo/nvram 丢失 = 串号/基带丢失，务必单独备份）
$parts = @('proinfo', 'nvram', 'nvdata', 'nvcfg', 'protect1', 'protect2', 'persist',
           'boot', 'recovery', 'system', 'vendor', 'userdata', 'misc', 'logo')
foreach ($p in $parts) {
    Write-Host "读回 $p ..." -ForegroundColor Cyan
    & mtk r $p (Join-Path $out "$p.bin")
    if ($LASTEXITCODE -ne 0) { Write-Host "警告：$p 读回失败，请重试或改用 SP Flash Tool Readback" -ForegroundColor Yellow }
}
# 全量 eMMC 兜底（耗时长，但最稳）
Write-Host '读回全量 eMMC（rl，耗时较长）...' -ForegroundColor Cyan
& mtk rl $out
Write-Host "备份完成：$out（请复制到电脑与网盘各一份）" -ForegroundColor Green
