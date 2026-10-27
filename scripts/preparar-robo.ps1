# Prepara o notebook do robô: tira os microfones do mudo (volume mínimo de 80%) e libera câmera e
# microfone para aplicativos da área de trabalho (Chrome/Edge) nas configurações de privacidade do Windows.
# Uso no notebook do robô (PowerShell):
#   irm https://raw.githubusercontent.com/joaodorast/telepresenca-robotica/main/scripts/preparar-robo.ps1 | iex

$code = @'
using System; using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ITpEndpointVolume {
  int RegisterControlChangeNotify(IntPtr p); int UnregisterControlChangeNotify(IntPtr p); int GetChannelCount(out int c);
  int SetMasterVolumeLevel(float v, ref Guid ctx); int SetMasterVolumeLevelScalar(float v, ref Guid ctx);
  int GetMasterVolumeLevel(out float v); int GetMasterVolumeLevelScalar(out float v);
  int SetChannelVolumeLevel(); int SetChannelVolumeLevelScalar(); int GetChannelVolumeLevel(); int GetChannelVolumeLevelScalar();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid ctx); int GetMute([MarshalAs(UnmanagedType.Bool)] out bool m);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ITpDevice { int Activate(ref Guid id, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ITpDeviceCollection { int GetCount(out int c); int Item(int i, out ITpDevice d); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ITpDeviceEnumerator { int EnumAudioEndpoints(int flow, int mask, out ITpDeviceCollection c); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class TpDeviceEnumerator {}
public static class TpMics {
  // Fluxo 1 = captura (microfones), máscara 1 = dispositivos ativos.
  public static int Unmute() {
    var en = (ITpDeviceEnumerator)new TpDeviceEnumerator(); ITpDeviceCollection col; en.EnumAudioEndpoints(1, 1, out col);
    int n; col.GetCount(out n); Guid ctx = Guid.Empty;
    for (int i = 0; i < n; i++) {
      ITpDevice d; col.Item(i, out d); object o; Guid g = typeof(ITpEndpointVolume).GUID; d.Activate(ref g, 23, IntPtr.Zero, out o);
      var v = (ITpEndpointVolume)o; float lvl; v.SetMute(false, ref ctx); v.GetMasterVolumeLevelScalar(out lvl);
      if (lvl < 0.8f) v.SetMasterVolumeLevelScalar(0.8f, ref ctx);
    }
    return n;
  }
}
'@
if (-not ('TpMics' -as [type])) { Add-Type -TypeDefinition $code }
$count = [TpMics]::Unmute()
Write-Host "Microfones ligados (sem mudo, volume >= 80%): $count"

$store = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore'
foreach ($cap in 'webcam', 'microphone') {
  foreach ($key in "$store\$cap", "$store\$cap\NonPackaged") {
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    Set-ItemProperty -Path $key -Name Value -Value 'Allow'
  }
}
Write-Host 'Camera e microfone liberados para o navegador nas configuracoes de privacidade.'

$cams = Get-PnpDevice -Class Camera, Image -PresentOnly -ErrorAction SilentlyContinue
if ($cams) {
  $cams | ForEach-Object { Write-Host "Camera encontrada: $($_.FriendlyName) ($($_.Status))" }
} else {
  Write-Host 'NENHUMA camera encontrada: aperte a tecla de camera do notebook (F8/F9/F10) ou abra a tampinha da camera.' -ForegroundColor Yellow
}
Write-Host 'Pronto. Recarregue a pagina do robo (F5) e toque em "Toque para iniciar".'
