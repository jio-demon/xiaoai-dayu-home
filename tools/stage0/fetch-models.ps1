# 下载本地唤醒模型（sherpa-onnx 中文 KWS + silero VAD）到 device-shell assets
# 需要网络；GitHub 下载慢时可手动下载后解压到目标目录。
$ErrorActionPreference = 'Stop'
$dst = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'apps\device-shell\app\src\main\assets\kws'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
$tmp = Join-Path $env:TEMP 'xiaoai-kws'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$kwsUrl = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01.tar.bz2'
$vadUrl = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx'

Write-Host '下载中文 KWS 模型（约 10MB）...' -ForegroundColor Cyan
$kwsTar = Join-Path $tmp 'kws.tar.bz2'
Invoke-WebRequest $kwsUrl -OutFile $kwsTar
tar -xjf $kwsTar -C $tmp
$kwsDir = Get-ChildItem $tmp -Directory -Filter '*kws-zipformer*' | Select-Object -First 1
Copy-Item (Join-Path $kwsDir.FullName '*.onnx') $dst -Force
Copy-Item (Join-Path $kwsDir.FullName 'tokens.txt') $dst -Force

Write-Host '下载 silero VAD...' -ForegroundColor Cyan
Invoke-WebRequest $vadUrl -OutFile (Join-Path $dst 'silero_vad.onnx')

Write-Host @"
模型已就位：$dst
最后一步：把唤醒词「大肥鱼」转成模型建模单元（中文 KWS 需要拼音单元）：
  1. git clone https://github.com/k2-fsa/sherpa-onnx
  2. python sherpa-onnx/scripts/kws/text2token.py --tokens $dst\tokens.txt --text 大肥鱼
     （不同版本脚本路径略有差异，搜索 text2token）
  3. 把输出写入 $dst\keywords.txt（可加 :1.8 #0.2 调分数/阈值）
没有 keywords.txt 时薄壳会退回原词尝试；识别率不佳时优先检查这一步。
"@ -ForegroundColor Green
