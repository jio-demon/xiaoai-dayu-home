# 构建大肥鱼之家薄壳 APK（本机工具链已就位版）
# 用法：powershell -File build-apk.ps1 [-SkipWeb]
# 工具链：tools\android\jdk（JDK17）、tools\android\gradle（8.7）、C:\Android（SDK 34）
param([switch]$SkipWeb)
$ErrorActionPreference = 'Stop'
$shell = $PSScriptRoot
$repo = Split-Path (Split-Path $shell -Parent) -Parent

if (-not $SkipWeb) {
    Write-Host '== 构建 Web 界面 ==' -ForegroundColor Cyan
    Push-Location $repo
    npm run build
    Pop-Location
    $assets = Join-Path $shell 'app\src\main\assets\web'
    # 先清空旧产物，避免旧 hash 文件残留被 WebView 缓存命中
    if (Test-Path $assets) { Remove-Item -LiteralPath $assets -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $assets | Out-Null
    Copy-Item -Path (Join-Path $repo 'apps\web\dist\*') -Destination $assets -Recurse -Force
    Write-Host "已复制 dist → $assets"
}

# 本机工具链（缺省回退到 PATH 上的 gradle）
$jdk = Get-ChildItem (Join-Path $repo 'tools\android\jdk') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if ($jdk) { $env:JAVA_HOME = $jdk.FullName; $env:Path = "$($jdk.FullName)\bin;$env:Path" }
$gradleHome = Join-Path $repo 'tools\android\gradle\gradle-8.7\bin'
if (Test-Path $gradleHome) { $env:Path = "$gradleHome;$env:Path" }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = 'C:\Android' }
Set-Content (Join-Path $shell 'local.properties') "sdk.dir=$($env:ANDROID_HOME -replace '\\','\\' -replace ':','\:')" -Encoding utf8NoBOM

$libs = Join-Path $shell 'app\libs'
if (-not (Get-ChildItem $libs -Filter '*.aar' -ErrorAction SilentlyContinue)) {
    Write-Host '提示：app\libs 无 sherpa-onnx AAR，KWS 唤醒将被禁用（仍可点麦克风说话）。' -ForegroundColor Yellow
}

Write-Host '== 构建 APK ==' -ForegroundColor Cyan
Push-Location $shell
$gradle = if (Test-Path (Join-Path $shell 'gradlew.bat')) { '.\gradlew.bat' } else { 'gradle' }
& $gradle assembleDebug --no-daemon --console=plain
Pop-Location
$apk = Join-Path $shell 'app\build\outputs\apk\debug\app-debug.apk'
if (Test-Path $apk) {
    $release = Join-Path $repo 'release'
    New-Item -ItemType Directory -Force -Path $release | Out-Null
    Copy-Item $apk (Join-Path $release 'dayu-home-v0.1.0.apk') -Force
    Write-Host "APK 就绪：$release\dayu-home-v0.1.0.apk" -ForegroundColor Green
}
