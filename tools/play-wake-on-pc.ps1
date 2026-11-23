param([string]$Wav = "F:\ai\xiaoai\tools\assets\wake-dayu-loud.wav", [double]$Volume = 0.15)
Add-Type -TypeDefinition ([IO.File]::ReadAllText("F:\ai\xiaoai\tools\vol.cs"))
$old = [Vol]::Get()
[Vol]::Set($Volume)
Write-Host ("音量 {0:P0} -> {1:P0}" -f $old, $Volume)
(New-Object System.Media.SoundPlayer($Wav)).PlaySync()
Start-Sleep -Milliseconds 300
[Vol]::Set($old)
Write-Host "播放完成，音量已还原"

