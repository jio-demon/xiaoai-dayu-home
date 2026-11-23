using System;
using System.Runtime.InteropServices;
public class Vol {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceEnumerator { int EnumAudioEndpoints(int dataFlow,int mask,out IntPtr devices); int GetDefaultAudioEndpoint(int dataFlow,int role,out IntPtr device); }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDevice { int Activate(ref Guid iid,int clsCtx,IntPtr act,out IntPtr iface); }
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioEndpointVolume { int RegisterNotification(IntPtr n); int UnregisterNotification(IntPtr n); int GetChannelCount(out uint c); int SetMasterVolumeLevel(float l,Guid g); int SetMasterVolumeLevelScalar(float l,Guid g); int GetMasterVolumeLevel(out float l); int GetMasterVolumeLevelScalar(out float l); }
  public static float Get() { var v = Ep(); float lvl; v.GetMasterVolumeLevelScalar(out lvl); return lvl; }
  public static void Set(float lvl) { Ep().SetMasterVolumeLevelScalar(lvl, Guid.Empty); }
  static IAudioEndpointVolume Ep() {
    var e = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
    IntPtr dev; e.GetDefaultAudioEndpoint(0,1,out dev);
    var d = (IMMDevice)Marshal.GetObjectForIUnknown(dev);
    var iid = typeof(IAudioEndpointVolume).GUID; IntPtr p;
    d.Activate(ref iid, 1, IntPtr.Zero, out p);
    return (IAudioEndpointVolume)Marshal.GetObjectForIUnknown(p);
  }
}
