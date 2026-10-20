# Ayudante persistente de Windows: volumen real (Core Audio) y control de reproductores (SMTC).
# Protocolo: una linea por peticion  "id|comando|argumento"  y una linea JSON por respuesta.
# Solo ASCII a proposito (PowerShell 5.1 lee el archivo con la codificacion del sistema).
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int f();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[ComImport, Guid("BCDE0395-E52F-49B1-8E5C-BB4FB7E8C7B3")]
class MMDeviceEnumeratorComObject { }

public class YureiAudio {
  static IAudioEndpointVolume Endpoint() {
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume epv = null;
    Guid epvid = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref epvid, 23, 0, out epv));
    return epv;
  }
  public static float GetVolume() {
    float v = -1;
    Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(out v));
    return v;
  }
  public static void SetVolume(float v) {
    Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(v, Guid.Empty));
  }
  public static bool GetMute() {
    bool m = false;
    Marshal.ThrowExceptionForHR(Endpoint().GetMute(out m));
    return m;
  }
  public static void SetMute(bool m) {
    Marshal.ThrowExceptionForHR(Endpoint().SetMute(m, Guid.Empty));
  }
}

public class YureiKeys {
  [DllImport("user32.dll")]
  static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo);
  public static void Press(byte vk) {
    keybd_event(vk, 0, 0, 0);
    keybd_event(vk, 0, 2, 0);
  }
}
"@

# --- SMTC (Windows 10 1809+): lo que suena ahora y sus controles ---
$script:smtc = $false
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $script:asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $script:smtc = $true
} catch {
  $script:smtc = $false
}

function Await($op, $type) {
  $task = $script:asTask.MakeGenericMethod($type).Invoke($null, @($op))
  [void]$task.Wait(5000)
  return $task.Result
}

function Get-Session {
  if (-not $script:smtc) { return $null }
  $mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
  $mgr = Await ($mgrType::RequestAsync()) $mgrType
  return $mgr.GetCurrentSession()
}

function Get-Media {
  $s = Get-Session
  if ($null -eq $s) { return @{ available = $false } }
  $propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
  $p = Await ($s.TryGetMediaPropertiesAsync()) $propsType
  $pb = $s.GetPlaybackInfo()
  $tl = $s.GetTimelineProperties()
  $duration = 0
  try { $duration = [int]($tl.EndTime - $tl.StartTime).TotalSeconds } catch { $duration = 0 }
  return @{
    available = $true
    app = [string]$s.SourceAppUserModelId
    title = [string]$p.Title
    artist = [string]$p.Artist
    status = $pb.PlaybackStatus.ToString()
    position = [int]$tl.Position.TotalSeconds
    duration = $duration
  }
}

function Invoke-Media($action, $arg) {
  $s = Get-Session
  if ($null -ne $s) {
    switch ($action) {
      'play'   { [void](Await ($s.TryPlayAsync()) ([bool])) }
      'pause'  { [void](Await ($s.TryPauseAsync()) ([bool])) }
      'toggle' { [void](Await ($s.TryTogglePlayPauseAsync()) ([bool])) }
      'next'   { [void](Await ($s.TrySkipNextAsync()) ([bool])) }
      'prev'   { [void](Await ($s.TrySkipPreviousAsync()) ([bool])) }
      'seek' {
        $tl = $s.GetTimelineProperties()
        $target = [Math]::Max(0, $tl.Position.TotalSeconds + [double]$arg)
        [void](Await ($s.TryChangePlaybackPositionAsync([long]($target * 10000000))) ([bool]))
      }
      default { throw "Accion desconocida: $action" }
    }
    return @{ done = $true }
  }
  # Sin sesion SMTC: teclas multimedia (play/pausa alterna; no hay retroceso por segundos)
  $keys = @{ toggle = 179; play = 179; pause = 179; next = 176; prev = 177 }
  if ($keys.ContainsKey($action)) {
    [YureiKeys]::Press([byte]$keys[$action])
    return @{ done = $true; viaKeys = $true }
  }
  throw 'No hay ningun reproductor activo'
}

function Get-Vol {
  return @{ volume = [int][Math]::Round([YureiAudio]::GetVolume() * 100); muted = [YureiAudio]::GetMute() }
}

function Set-Vol($percent) {
  $p = [Math]::Max(0, [Math]::Min(100, [double]$percent))
  [YureiAudio]::SetVolume([float]($p / 100))
  if ($p -gt 0 -and [YureiAudio]::GetMute()) { [YureiAudio]::SetMute($false) }
  return Get-Vol
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $parts = $line -split '\|', 3
  $id = $parts[0]
  $cmd = $parts[1]
  $arg = ''
  if ($parts.Count -gt 2) { $arg = $parts[2] }
  try {
    $data = $null
    switch ($cmd) {
      'ping'      { $data = @{ smtc = $script:smtc } }
      'vol.get'   { $data = Get-Vol }
      'vol.set'   { $data = Set-Vol $arg }
      'vol.step'  { $data = Set-Vol (([YureiAudio]::GetVolume() * 100) + [double]$arg) }
      'vol.mute'  { [YureiAudio]::SetMute(($arg -eq 'true')); $data = Get-Vol }
      'media.get' { $data = Get-Media }
      'media.cmd' { $a = $arg -split ':', 2; $data = Invoke-Media $a[0] $(if ($a.Count -gt 1) { $a[1] } else { '' }) }
      default     { throw "Comando desconocido: $cmd" }
    }
    $out = @{ id = $id; ok = $true; data = $data }
  } catch {
    $out = @{ id = $id; ok = $false; error = $_.Exception.Message }
  }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress -Depth 6))
  [Console]::Out.Flush()
}
