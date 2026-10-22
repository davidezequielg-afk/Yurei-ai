# Ayudante persistente de Windows: volumen real (Core Audio) y control de reproductores (SMTC).
# Protocolo: una linea por peticion  "id|comando|argumento"  y una linea JSON por respuesta.
# Solo ASCII a proposito (PowerShell 5.1 lee el archivo con la codificacion del sistema).
$ErrorActionPreference = 'Stop'

# E/S sin depender de una consola. La app lanza este proceso oculto (sin ventana NI consola), y en Windows
# PowerShell 5.1 tocar [Console]::OutputEncoding sin consola falla ("identificador no valido") y mataba el script.
$utf8 = New-Object System.Text.UTF8Encoding($false)
$out = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $utf8)
$out.AutoFlush = $true
$in = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $utf8)
$script:initErrors = @()

# Si algo de esto falla, el resto sigue funcionando (y el fallo se informa con el comando diag).
try {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
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

[ComImport, Guid("00000001-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IClassFactoryY {
  [PreserveSig] int CreateInstance(IntPtr pUnkOuter, ref Guid riid, out IntPtr ppvObject);
  [PreserveSig] int LockServer([MarshalAs(UnmanagedType.Bool)] bool fLock);
}

[UnmanagedFunctionPointer(CallingConvention.StdCall)]
delegate int DllGetClassObjectFnY(ref Guid rclsid, ref Guid riid, out IntPtr ppv);

static class NativeY {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern IntPtr LoadLibrary(string name);
  [DllImport("kernel32.dll", CharSet = CharSet.Ansi, ExactSpelling = true)] public static extern IntPtr GetProcAddress(IntPtr module, string name);
}

public class YureiAudio {
  // Normalmente COM encuentra el componente por el registro. En algunos equipos el registro no lo ofrece (0x80040154, "clase no
  // registrada"): entonces se carga MMDevAPI.dll directamente y se le pide el componente sin pasar por el registro.
  public static string Via = "registro";
  static IMMDeviceEnumerator Enumerator() {
    try { return new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator; }
    catch (COMException) { }
    IntPtr lib = NativeY.LoadLibrary(System.IO.Path.Combine(Environment.SystemDirectory, "MMDevAPI.dll"));
    if (lib == IntPtr.Zero) throw new InvalidOperationException("No se pudo cargar MMDevAPI.dll");
    IntPtr proc = NativeY.GetProcAddress(lib, "DllGetClassObject");
    if (proc == IntPtr.Zero) throw new InvalidOperationException("MMDevAPI.dll no ofrece DllGetClassObject");
    var fn = (DllGetClassObjectFnY)Marshal.GetDelegateForFunctionPointer(proc, typeof(DllGetClassObjectFnY));
    Guid clsid = new Guid("BCDE0395-E52F-49B1-8E5C-BB4FB7E8C7B3");
    Guid iidFactory = new Guid("00000001-0000-0000-C000-000000000046");
    IntPtr pf;
    Marshal.ThrowExceptionForHR(fn(ref clsid, ref iidFactory, out pf));
    IClassFactoryY factory = (IClassFactoryY)Marshal.GetObjectForIUnknown(pf);
    Marshal.Release(pf);
    Guid iidEnum = typeof(IMMDeviceEnumerator).GUID;
    IntPtr pe;
    Marshal.ThrowExceptionForHR(factory.CreateInstance(IntPtr.Zero, ref iidEnum, out pe));
    object en = Marshal.GetObjectForIUnknown(pe);
    Marshal.Release(pe);
    Via = "MMDevAPI.dll directo";
    return (IMMDeviceEnumerator)en;
  }
  static IAudioEndpointVolume Endpoint() {
    var enumerator = Enumerator();
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
    Guid ctx = Guid.Empty;
    Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(v, ref ctx));
  }
  public static bool GetMute() {
    bool m = false;
    Marshal.ThrowExceptionForHR(Endpoint().GetMute(out m));
    return m;
  }
  public static void SetMute(bool m) {
    Guid ctx = Guid.Empty;
    Marshal.ThrowExceptionForHR(Endpoint().SetMute(m, ref ctx));
  }
}

public class YureiKeys {
  [DllImport("user32.dll")]
  static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo);
  public static void Press(byte vk) {
    keybd_event(vk, 0, 0, 0);
    keybd_event(vk, 0, 2, 0);
  }
  public static void Down(byte vk) { keybd_event(vk, 0, 0, 0); }
  public static void Up(byte vk) { keybd_event(vk, 0, 2, 0); }
}
"@
} catch {
  $script:initErrors += "codigo de audio: $($_.Exception.Message)"
}

# --- Mezclador por aplicacion (sesiones de audio) y ventana en primer plano. Cada bloque aparte: si falla, solo se pierde eso.
$script:mixer = $false
try {
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolumeM {
  int SetMasterVolume(float level, ref Guid ctx);
  int GetMasterVolume(out float level);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}

[Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControlM {
  int a(); int b(); int c(); int d(); int e(); int f(); int g(); int h(); int i();
}

[Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2M {
  int a(); int b(); int c(); int d(); int e(); int f(); int g(); int h(); int i();
  int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
  int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
  int GetProcessId(out uint pid);
  int IsSystemSoundsSession();
}

[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumeratorM {
  int GetCount(out int count);
  int GetSession(int index, out IAudioSessionControlM session);
}

[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2M {
  int a(); int b();
  int GetSessionEnumerator(out IAudioSessionEnumeratorM enumerator);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceM {
  int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioSessionManager2M mgr);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumeratorM {
  int f();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDeviceM endpoint);
}

[ComImport, Guid("BCDE0395-E52F-49B1-8E5C-BB4FB7E8C7B3")]
class MMDeviceEnumeratorComObjectM { }

[ComImport, Guid("00000001-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IClassFactoryM {
  [PreserveSig] int CreateInstance(IntPtr pUnkOuter, ref Guid riid, out IntPtr ppvObject);
  [PreserveSig] int LockServer([MarshalAs(UnmanagedType.Bool)] bool fLock);
}

[UnmanagedFunctionPointer(CallingConvention.StdCall)]
delegate int DllGetClassObjectFnM(ref Guid rclsid, ref Guid riid, out IntPtr ppv);

static class NativeM {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern IntPtr LoadLibrary(string name);
  [DllImport("kernel32.dll", CharSet = CharSet.Ansi, ExactSpelling = true)] public static extern IntPtr GetProcAddress(IntPtr module, string name);
}

public class YureiMixer {
  static IMMDeviceEnumeratorM Enumerator() {
    try { return new MMDeviceEnumeratorComObjectM() as IMMDeviceEnumeratorM; }
    catch (COMException) { }
    IntPtr lib = NativeM.LoadLibrary(System.IO.Path.Combine(Environment.SystemDirectory, "MMDevAPI.dll"));
    if (lib == IntPtr.Zero) throw new InvalidOperationException("No se pudo cargar MMDevAPI.dll");
    IntPtr proc = NativeM.GetProcAddress(lib, "DllGetClassObject");
    if (proc == IntPtr.Zero) throw new InvalidOperationException("MMDevAPI.dll no ofrece DllGetClassObject");
    var fn = (DllGetClassObjectFnM)Marshal.GetDelegateForFunctionPointer(proc, typeof(DllGetClassObjectFnM));
    Guid clsid = new Guid("BCDE0395-E52F-49B1-8E5C-BB4FB7E8C7B3");
    Guid iidFactory = new Guid("00000001-0000-0000-C000-000000000046");
    IntPtr pf;
    Marshal.ThrowExceptionForHR(fn(ref clsid, ref iidFactory, out pf));
    IClassFactoryM factory = (IClassFactoryM)Marshal.GetObjectForIUnknown(pf);
    Marshal.Release(pf);
    Guid iidEnum = typeof(IMMDeviceEnumeratorM).GUID;
    IntPtr pe;
    Marshal.ThrowExceptionForHR(factory.CreateInstance(IntPtr.Zero, ref iidEnum, out pe));
    object en = Marshal.GetObjectForIUnknown(pe);
    Marshal.Release(pe);
    return (IMMDeviceEnumeratorM)en;
  }
  static List<object[]> Each() {
    var res = new List<object[]>();
    var en = Enumerator();
    IMMDeviceM dev = null;
    Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioSessionManager2M mgr = null;
    Guid g = typeof(IAudioSessionManager2M).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref g, 23, 0, out mgr));
    IAudioSessionEnumeratorM list = null;
    Marshal.ThrowExceptionForHR(mgr.GetSessionEnumerator(out list));
    int n = 0;
    list.GetCount(out n);
    for (int i = 0; i < n; i++) {
      IAudioSessionControlM ctl = null;
      list.GetSession(i, out ctl);
      var c2 = (IAudioSessionControl2M)ctl;
      var vol = (ISimpleAudioVolumeM)ctl;
      uint pid = 0;
      c2.GetProcessId(out pid);
      float level = 0; bool mute = false;
      vol.GetMasterVolume(out level);
      vol.GetMute(out mute);
      res.Add(new object[] { pid, level, mute, vol });
    }
    return res;
  }
  public static string List() {
    var sb = new System.Text.StringBuilder();
    foreach (var s in Each()) sb.Append(s[0]).Append(',').Append(((float)s[1]).ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)).Append(',').Append((bool)s[2] ? 1 : 0).Append(';');
    return sb.ToString();
  }
  public static void SetVolume(uint pid, float level) {
    Guid ctx = Guid.Empty;
    foreach (var s in Each()) if ((uint)s[0] == pid) ((ISimpleAudioVolumeM)s[3]).SetMasterVolume(level, ref ctx);
  }
  public static void SetMute(uint pid, bool mute) {
    Guid ctx = Guid.Empty;
    foreach (var s in Each()) if ((uint)s[0] == pid) ((ISimpleAudioVolumeM)s[3]).SetMute(mute, ref ctx);
  }
}
"@
$script:mixer = $true
} catch {
  $script:initErrors += "mezclador: $($_.Exception.Message)"
}

$script:fgok = $false
try {
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class YureiWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  // Devuelve: clase|pid|maximizada|izq,arr,der,aba
  public static string Info() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero || !IsWindowVisible(h)) return "||0|0,0,0,0";
    RECT r; GetWindowRect(h, out r);
    var sb = new StringBuilder(256);
    GetClassName(h, sb, 256);
    uint pid; GetWindowThreadProcessId(h, out pid);
    return sb.ToString() + "|" + pid + "|" + (IsZoomed(h) ? 1 : 0) + "|" + r.L + "," + r.T + "," + r.R + "," + r.B;
  }
}
"@
$script:fgok = $true
} catch {
  $script:initErrors += "ventana activa: $($_.Exception.Message)"
}

function Get-Mixer {
  if (-not $script:mixer) { throw 'El mezclador no esta disponible en este equipo' }
  $apps = @{}
  foreach ($e in (([YureiMixer]::List()) -split ';' | Where-Object { $_ })) {
    $p = $e -split ','
    $pid2 = [uint32]$p[0]
    $name = 'Sonidos del sistema'
    if ($pid2 -ne 0) { try { $name = (Get-Process -Id $pid2 -ErrorAction Stop).ProcessName } catch { continue } }
    $v = [double]::Parse($p[1], [Globalization.CultureInfo]::InvariantCulture)
    if (-not $apps.ContainsKey($name)) { $apps[$name] = @{ pid = [int]$pid2; name = $name; volume = [int][Math]::Round($v * 100); muted = ($p[2] -eq '1') } }
  }
  return @{ apps = @($apps.Values | Sort-Object { $_.name }) }
}
function Set-MixerVolume($arg) {
  $a = $arg -split ':', 2
  [YureiMixer]::SetVolume([uint32]$a[0], [float]([Math]::Max(0, [Math]::Min(100, [double]$a[1])) / 100))
  return @{ done = $true }
}
function Set-MixerMute($arg) {
  $a = $arg -split ':', 2
  [YureiMixer]::SetMute([uint32]$a[0], ($a[1] -eq 'true'))
  return @{ done = $true }
}
function Get-Foreground {
  if (-not $script:fgok) { throw 'No disponible' }
  $p = ([YureiWin]::Info()) -split '\|'
  $r = $p[3] -split ','
  return @{ cls = $p[0]; pid = [int]$(if ($p[1]) { $p[1] } else { 0 }); maximized = ($p[2] -eq '1'); rect = @([int]$r[0], [int]$r[1], [int]$r[2], [int]$r[3]) }
}

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
  $script:initErrors += "reproductores (SMTC): $($_.Exception.Message)"
}

# Teclas multimedia de Windows: plan B cuando no se puede usar el audio exacto o un reproductor no se deja controlar.
function Press-Key([int]$vk, [int]$times = 1) {
  for ($i = 0; $i -lt $times; $i++) {
    if ('YureiKeys' -as [type]) { [YureiKeys]::Press([byte]$vk) }
    else {
      if (-not $script:wsh) { $script:wsh = New-Object -ComObject WScript.Shell }
      $script:wsh.SendKeys([string][char]$vk)
    }
  }
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

# Combinaciones de teclas del sistema (Win+N, Win+B, Win+Tab...). Solo las que Yurei permite desde su lado.
function Press-Combo($arg) {
  $vks = @($arg -split ',' | ForEach-Object { [int]$_ })
  if (-not ('YureiKeys' -as [type])) { throw 'Las teclas del sistema no estan disponibles' }
  foreach ($k in $vks) { [YureiKeys]::Down([byte]$k) }
  [array]::Reverse($vks)
  foreach ($k in $vks) { [YureiKeys]::Up([byte]$k) }
  return @{ done = $true }
}

# Radios de Windows (Wi-Fi y Bluetooth): estado y encendido/apagado, como el panel de modo avion.
function Get-RadioList {
  [void][Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime]
  [void][Windows.Devices.Radios.RadioAccessStatus, Windows.System.Devices, ContentType = WindowsRuntime]
  $listType = [System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]]
  return Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) $listType
}
function Get-Radios {
  $out = @{ wifi = @{ present = $false; on = $false }; bluetooth = @{ present = $false; on = $false } }
  foreach ($r in (Get-RadioList)) {
    $key = $null
    if ($r.Kind.ToString() -eq 'WiFi') { $key = 'wifi' } elseif ($r.Kind.ToString() -eq 'Bluetooth') { $key = 'bluetooth' }
    if ($key) { $out[$key] = @{ present = $true; on = ($r.State.ToString() -eq 'On') } }
  }
  return $out
}
function Set-Radio($arg) {
  $parts = $arg -split ':', 2
  $kind = if ($parts[0] -eq 'wifi') { 'WiFi' } elseif ($parts[0] -eq 'bluetooth') { 'Bluetooth' } else { throw 'Radio desconocida' }
  $state = if ($parts[1] -eq 'true') { 'On' } else { 'Off' }
  $done = $false
  foreach ($r in (Get-RadioList)) {
    if ($r.Kind.ToString() -eq $kind) {
      $status = Await ($r.SetStateAsync($state)) ([Windows.Devices.Radios.RadioAccessStatus])
      if ($status.ToString() -ne 'Allowed') { throw "Windows no dejo cambiarlo ($status)" }
      $done = $true
    }
  }
  if (-not $done) { throw 'Este equipo no tiene esa radio' }
  return Get-Radios
}

# Dispositivos Bluetooth emparejados (nombre, si estan conectados y bateria cuando Windows la informa).
function Get-BtDevices {
  $devs = @()
  $items = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -and (($_.InstanceId -like 'BTHENUM\DEV_*') -or ($_.InstanceId -like 'BTHLE\DEV_*')) }
  $seen = @{}
  foreach ($d in $items) {
    if ($seen.ContainsKey($d.FriendlyName)) { continue }
    $seen[$d.FriendlyName] = $true
    $conn = $false; $bat = $null
    try { $conn = [bool](Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName '{83DA6326-97A6-4088-9453-A1923F573B29} 15' -ErrorAction Stop).Data } catch {}
    try { $bat = [int](Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2' -ErrorAction Stop).Data } catch {}
    $devs += @{ name = [string]$d.FriendlyName; connected = $conn; battery = $bat }
  }
  return $devs
}

# Brillo de la pantalla integrada (notebooks). Los monitores de PC de escritorio no se pueden controlar asi.
function Get-Bright {
  $b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $b) { return @{ available = $false } }
  return @{ available = $true; level = [int]$b.CurrentBrightness }
}
function Set-Bright($percent) {
  $p = [int][Math]::Max(0, [Math]::Min(100, [double]$percent))
  $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $m) { throw 'Esta pantalla no permite cambiar el brillo desde Windows' }
  [void](Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]0; Brightness = [byte]$p })
  return Get-Bright
}

# Tapa del disco / miniatura de lo que suena (la entrega el propio reproductor a Windows).
function Get-Cover {
  $s = Get-Session
  if ($null -eq $s) { return @{ cover = $null } }
  $propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
  $p = Await ($s.TryGetMediaPropertiesAsync()) $propsType
  if ($null -eq $p -or $null -eq $p.Thumbnail) { return @{ cover = $null } }
  $streamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $st = Await ($p.Thumbnail.OpenReadAsync()) $streamType
  try {
    if ($st.Size -le 0 -or $st.Size -gt 716800) { return @{ cover = $null } }
    $src = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st)
    $ms = New-Object System.IO.MemoryStream
    $src.CopyTo($ms)
    return @{ cover = @{ mime = [string]$st.ContentType; b64 = [Convert]::ToBase64String($ms.ToArray()) }; title = [string]$p.Title; artist = [string]$p.Artist }
  } finally { $st.Dispose() }
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
    Press-Key $keys[$action]
    return @{ done = $true; viaKeys = $true }
  }
  throw 'No hay ningun reproductor activo'
}

# Volumen exacto (Core Audio). Si falla, plan B con las teclas de volumen (pasos de 2 %, sin poder leerlo).
function Get-Vol {
  try {
    return @{ volume = [int][Math]::Round([YureiAudio]::GetVolume() * 100); muted = [YureiAudio]::GetMute(); mode = 'exacto' }
  } catch {
    $script:audioError = $_.Exception.Message
    return @{ volume = $null; muted = $null; mode = 'teclas'; note = 'Sin lectura exacta: se ajusta con las teclas de volumen' }
  }
}

function Set-Vol($percent) {
  $p = [Math]::Max(0, [Math]::Min(100, [double]$percent))
  try {
    [YureiAudio]::SetVolume([float]($p / 100))
    if ($p -gt 0 -and [YureiAudio]::GetMute()) { [YureiAudio]::SetMute($false) }
    return Get-Vol
  } catch {
    $script:audioError = $_.Exception.Message
    # Plan B con las teclas de volumen (cada tecla = 2 %). Si todavía se puede leer el nivel actual, se suben o bajan solo los
    # pasos que faltan: así el volumen va directo al valor pedido, sin bajar al mínimo y volver a subir.
    $cur = $null
    try { $cur = [Math]::Round([YureiAudio]::GetVolume() * 100) } catch { $cur = $script:lastKeyVol } # sin lectura: se parte del último nivel que se pidió
    if ($null -ne $cur) {
      $d = $p - $cur
      if ([Math]::Abs($d) -ge 1) {
        $steps = [int][Math]::Max(1, [Math]::Round([Math]::Abs($d) / 2))
        if ($d -gt 0) { Press-Key 175 $steps } else { Press-Key 174 $steps }
      }
    } else {
      Press-Key 174 50 # sin lectura: al mínimo y sube hasta el nivel pedido
      Press-Key 175 ([int][Math]::Round($p / 2))
    }
    $script:lastKeyVol = [int]$p
    return @{ volume = [int]$p; muted = $false; mode = 'teclas' }
  }
}

function Step-Vol($delta) {
  $d = [double]$delta
  try {
    return Set-VolExact ((([YureiAudio]::GetVolume()) * 100) + $d)
  } catch {
    $script:audioError = $_.Exception.Message
    if ($d -gt 0) { Press-Key 175 ([int][Math]::Max(1, [Math]::Round($d / 2))) } else { Press-Key 174 ([int][Math]::Max(1, [Math]::Round(-$d / 2))) }
    return @{ volume = $null; muted = $false; mode = 'teclas' }
  }
}

function Set-VolExact($percent) {
  $p = [Math]::Max(0, [Math]::Min(100, [double]$percent))
  [YureiAudio]::SetVolume([float]($p / 100))
  if ($p -gt 0 -and [YureiAudio]::GetMute()) { [YureiAudio]::SetMute($false) }
  return Get-Vol
}

function Set-Mute([bool]$m) {
  try { [YureiAudio]::SetMute($m); return Get-Vol }
  catch { $script:audioError = $_.Exception.Message; Press-Key 173; return @{ volume = $null; muted = $m; mode = 'teclas' } }
}

while ($true) {
  $line = $in.ReadLine()
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
      'vol.step'  { $data = Step-Vol $arg }
      'vol.mute'  { $data = Set-Mute ($arg -eq 'true') }
      'diag'      { $v = Get-Vol; $data = @{ powershell = $PSVersionTable.PSVersion.ToString(); proceso64bits = [Environment]::Is64BitProcess; arquitectura = "$env:PROCESSOR_ARCHITECTURE/$env:PROCESSOR_ARCHITEW6432"; comoSeAbreElAudio = $(if ('YureiAudio' -as [type]) { [YureiAudio]::Via } else { $null }); audioExacto = [bool]('YureiAudio' -as [type]); teclas = [bool]('YureiKeys' -as [type]); reproductores = $script:smtc; erroresAlIniciar = @($script:initErrors); volumen = $v; ultimoErrorDeAudio = $script:audioError } }
      'media.get' { $data = Get-Media }
      'media.cover' { $data = Get-Cover }
      'keys.combo' { $data = Press-Combo $arg }
      'radio.get' { $data = Get-Radios }
      'radio.set' { $data = Set-Radio $arg }
      'bt.list' { $data = @{ devices = @(Get-BtDevices) } }
      'mix.list' { $data = Get-Mixer }
      'mix.set' { $data = Set-MixerVolume $arg }
      'mix.mute' { $data = Set-MixerMute $arg }
      'fg.info' { $data = Get-Foreground }
      'bright.get' { $data = Get-Bright }
      'bright.set' { $data = Set-Bright $arg }
      'media.cmd' { $a = $arg -split ':', 2; $data = Invoke-Media $a[0] $(if ($a.Count -gt 1) { $a[1] } else { '' }) }
      default     { throw "Comando desconocido: $cmd" }
    }
    $reply = @{ id = $id; ok = $true; data = $data }
  } catch {
    $reply = @{ id = $id; ok = $false; error = $_.Exception.Message }
  }
  $out.WriteLine(($reply | ConvertTo-Json -Compress -Depth 6))
}
