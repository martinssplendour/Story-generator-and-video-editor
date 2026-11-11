$ErrorActionPreference = 'Stop'
$env:HYPERFRAMES_PYTHON = (Get-Command python).Source
$paragraphs = (Get-Content -Raw 'narration.txt') -split "(?:\r?\n){2,}" | Where-Object { $_.Trim() }
$groups = @()
$bucket = @()
$words = 0
foreach ($paragraph in $paragraphs) {
  $count = ($paragraph -split '\s+').Count
  if ($words + $count -gt 105 -and $bucket.Count -gt 0) {
    $groups += ,($bucket -join "`r`n`r`n")
    $bucket = @()
    $words = 0
  }
  $bucket += $paragraph.Trim()
  $words += $count
}
if ($bucket.Count -gt 0) { $groups += ,($bucket -join "`r`n`r`n") }

$segmentDir = 'assets/audio/segments'
New-Item -ItemType Directory -Force $segmentDir | Out-Null
$concatLines = @()
for ($i = 0; $i -lt $groups.Count; $i++) {
  $number = '{0:D2}' -f ($i + 1)
  $textFile = Join-Path $segmentDir "segment-$number.txt"
  $wavFile = Join-Path $segmentDir "segment-$number.wav"
  Set-Content -LiteralPath $textFile -Value $groups[$i] -Encoding UTF8
  & npx.cmd hyperframes tts $textFile --voice bf_emma --speed 1.08 --output $wavFile
  if ($LASTEXITCODE -ne 0) { throw "TTS failed for segment $number" }
  $absolute = (Resolve-Path $wavFile).Path.Replace("'", "''")
  $concatLines += "file '$absolute'"
}
$concatPath = Join-Path $segmentDir 'concat.txt'
Set-Content -LiteralPath $concatPath -Value $concatLines -Encoding ascii
& ffmpeg -y -f concat -safe 0 -i $concatPath -c:a pcm_s16le 'assets/audio/double-life-draft.wav'
if ($LASTEXITCODE -ne 0) { throw 'ffmpeg concat failed' }
