# Mantener apretado para hablar: mira UNA sola tecla (la elegida en Ajustes) y avisa cuando se aprieta o se suelta.
# No registra ninguna otra tecla ni lo que escribes.
param([int]$vk)
$ErrorActionPreference = 'Stop'
Add-Type -Namespace Yurei -Name Keys -MemberDefinition '[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);'
$out = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput())
$out.AutoFlush = $true
$down = $false
$out.WriteLine('ready')
while ($true) {
  $now = ([Yurei.Keys]::GetAsyncKeyState($vk) -band 0x8000) -ne 0
  if ($now -ne $down) {
    $down = $now
    if ($down) { $out.WriteLine('down') } else { $out.WriteLine('up') }
  }
  Start-Sleep -Milliseconds 25
}
