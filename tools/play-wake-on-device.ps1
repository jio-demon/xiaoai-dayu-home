param(
    [string]$Wav = "F:\ai\xiaoai\tools\assets\wake-dayu.wav",
    [string]$Serial = "192.168.31.149:5555",
    [double]$Gain = 1.0
)
# 通过设备扬声器播放唤醒词 WAV，声学回环测试真机 KWS/VAD/ASR 链路。
# 用法：powershell -File tools\play-wake-on-device.ps1 [-Gain 1.5]
$ErrorActionPreference = 'Stop'
$bytes = [IO.File]::ReadAllBytes($Wav)
# 解析 WAV header（44 字节标准 PCM）
$dataOff = 44
$pcm = New-Object byte[] ($bytes.Length - $dataOff)
[Array]::Copy($bytes, $dataOff, $pcm, 0, $pcm.Length)
if ($Gain -ne 1.0) {
    for ($i = 0; $i -lt $pcm.Length - 1; $i += 2) {
        $v = [BitConverter]::ToInt16($pcm, $i) * $Gain
        if ($v -gt 32767) { $v = 32767 } elseif ($v -lt -32768) { $v = -32768 }
        $b = [BitConverter]::GetBytes([int16]$v)
        $pcm[$i] = $b[0]; $pcm[$i+1] = $b[1]
    }
}
$out = [IO.Path]::ChangeExtension($Wav, ".dev.wav")
$ms = New-Object IO.MemoryStream
$bw = New-Object IO.BinaryWriter($ms)
$bw.Write([Text.Encoding]::ASCII.GetBytes('RIFF')); $bw.Write([int](36 + $pcm.Length))
$bw.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt ')); $bw.Write([int]16); $bw.Write([int16]1); $bw.Write([int16]1)
$bw.Write([int]16000); $bw.Write([int]32000); $bw.Write([int16]2); $bw.Write([int16]16)
$bw.Write([Text.Encoding]::ASCII.GetBytes('data')); $bw.Write([int]$pcm.Length); $bw.Write($pcm)
[IO.File]::WriteAllBytes($out, $ms.ToArray())
adb -s $Serial push $out /sdcard/wake-test.wav | Out-Null
# 媒体音量拉满（stream 3 = MUSIC）
adb -s $Serial shell media volume --stream 3 --set 15 | Out-Null
adb -s $Serial shell am start -a android.intent.action.VIEW -d file:///sdcard/wake-test.wav -t audio/wav | Out-Null
Write-Host "已在设备播放：$out (gain=$Gain)"
