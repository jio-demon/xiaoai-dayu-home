# G1 刷机脚本：仅做检查与引导，实际写盘由 SP Flash Tool / mtkclient 完成（防误刷）
# 支持两条路线：
#   A. Hikaru 官改固件（推荐，社区维护，含 root/精简）：SP Flash Tool + scatter
#   B. mtkclient 直刷 boot/system（进阶）
param(
    [string]$FirmwareDir,
    [ValidateSet('spflash', 'mtk')][string]$Mode = 'spflash'
)
$ErrorActionPreference = 'Stop'
Write-Host '== LX04 刷机 ==' -ForegroundColor Cyan

# 硬性门槛：必须先有备份
$backups = Get-ChildItem $PSScriptRoot -Directory -Filter 'backup_*' -ErrorAction SilentlyContinue
if (-not $backups) {
    Write-Host '未找到备份目录！先运行 backup.ps1 完成 G1 备份。' -ForegroundColor Red
    exit 1
}
Write-Host "找到备份：$($backups[-1].FullName)"
if (-not $FirmwareDir -or -not (Test-Path $FirmwareDir)) {
    Write-Host '用法：flash.ps1 -FirmwareDir <固件目录（含 scatter 文件）> [-Mode spflash|mtk]'
    exit 1
}
$scatter = Get-ChildItem $FirmwareDir -Filter '*_Android_scatter*.txt' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $scatter) { Write-Host '固件目录缺少 scatter 文件' -ForegroundColor Red; exit 1 }

Write-Host '警告：刷机有变砖风险；eMMC 老化的机器可能写入失败，务必保持供电稳定。' -ForegroundColor Yellow
Read-Host '确认继续请按回车（Ctrl+C 取消）'

if ($Mode -eq 'spflash') {
    $sp = Get-Command flash_tool -ErrorAction SilentlyContinue
    if ($sp) { & flash_tool } else {
        Write-Host '请手动打开 SP Flash Tool：'
        Write-Host "  1. Download-Agent 选 MTK_AllInOne_DA.bin"
        Write-Host "  2. Scatter 选 $($scatter.FullName)"
        Write-Host '  3. 模式 Download Only（不要 Format All + Download！会丢 proinfo/nvram）'
        Write-Host '  4. 点 Download 后，设备关机按住音量+ 插 USB'
    }
} else {
    $mtk = Get-Command mtk -ErrorAction SilentlyContinue
    if (-not $mtk) { Write-Host '未安装 mtkclient：pip install mtkclient' -ForegroundColor Red; exit 1 }
    Write-Host 'mtkclient 路线：仅写 boot/system/vendor（保留 proinfo/nvram）：'
    foreach ($p in @('boot', 'system', 'vendor')) {
        $img = Get-ChildItem $FirmwareDir -Filter "$p*.img" | Select-Object -First 1
        if ($img) { Write-Host "mtk w $p $($img.FullName)"; & mtk w $p $img.FullName }
    }
}
Write-Host '刷机完成后：adb devices 验证 → 安装 apps/device-shell APK → 进入 stage0 checklist G2。'
