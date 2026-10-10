$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Speech

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$audioDir = Join-Path $projectRoot 'test-results\audio'
New-Item -ItemType Directory -Force -Path $audioDir | Out-Null
$audioPath = Join-Path $audioDir 'hsk-recognition-input.wav'
$culture = [System.Globalization.CultureInfo]::GetCultureInfo('zh-CN')
$phrase = -join (@(
  0x4F60, 0x597D, 0xFF0C, 0x6211, 0x5728, 0x5B66, 0x4E60, 0x4E2D, 0x6587,
  0x3002, 0x4ECA, 0x5929, 0x6211, 0x60F3, 0x7EC3, 0x4E60, 0x53E3, 0x8BED, 0x3002
) | ForEach-Object { [char]$_ })
$expectedHello = -join @([char]0x4F60, [char]0x597D)
$expectedChinese = -join @([char]0x4E2D, [char]0x6587)

$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $synthesizer.SelectVoiceByHints(
    [System.Speech.Synthesis.VoiceGender]::Female,
    [System.Speech.Synthesis.VoiceAge]::Adult,
    0,
    $culture
  )
  $synthesizer.SetOutputToWaveFile($audioPath)
  $synthesizer.Speak($phrase)
}
finally {
  $synthesizer.Dispose()
}

$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)
try {
  $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $recognizer.SetInputToWaveFile($audioPath)
  $result = $recognizer.Recognize([TimeSpan]::FromSeconds(15))
}
finally {
  $recognizer.Dispose()
}

if ($null -eq $result) {
  throw 'Microsoft Chinese speech recognition returned no result'
}

if ($result.Text -notmatch $expectedHello -or $result.Text -notmatch $expectedChinese) {
  throw "Microsoft Chinese speech recognition mismatch: $($result.Text)"
}

[PSCustomObject]@{
  Passed = $true
  Transcript = $result.Text
  Confidence = [Math]::Round($result.Confidence, 3)
  AudioBytes = (Get-Item -LiteralPath $audioPath).Length
} | Format-List
