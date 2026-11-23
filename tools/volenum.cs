using System;
using System.Runtime.InteropServices;
public class VolEnum {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceEnumerator { int EnumAudioEndpoints(int dataFlow,int mask,out IntPtr devices); int GetDefaultAudioEndpoint(int dataFlow,int role,out IntPtr device); }
  [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceCollection { int GetCount(out uint c); int Item(uint i, out IntPtr dev); }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDevice { int Activate(ref Guid iid,int clsCtx,IntPtr act,out IntPtr iface); int OpenPropertyStore(int mode, out IntPtr props); int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id); int GetState(out uint state); }
  [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IPropertyStore { int GetCount(out uint c); int GetAt(uint i, out PROPERTYKEY key); int GetValue(ref PROPERTYKEY key, out PROPVARIANT val); int SetValue(ref PROPERTYKEY key, ref PROPVARIANT val); int Commit(); }
  [StructLayout(LayoutKind.Sequential)] public struct PROPERTYKEY { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Sequential)] public struct PROPVARIANT { public ushort vt; ushort r1; ushort r2; ushort r3; public IntPtr p; }
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioEndpointVolume { int RegisterNotification(IntPtr n); int UnregisterNotification(IntPtr n); int GetChannelCount(out uint c); int SetMasterVolumeLevel(float l,Guid g); int SetMasterVolumeLevelScalar(float l,Guid g); int GetMasterVolumeLevel(out float l); int GetMasterVolumeLevelScalar(out float l); int SetChannelVolumeLevel(uint ch,float l,Guid g); int SetChannelVolumeLevelScalar(uint ch,float l,Guid g); int GetChannelVolumeLevel(uint ch,out float l); int GetChannelVolumeLevelScalar(uint ch,out float l); int SetMute(bool m,Guid g); int GetMute(out bool m); }
  static PROPERTYKEY NameKey = new PROPERTYKEY { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };
  public static void List() {
    var e = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
    IntPtr colPtr; e.EnumAudioEndpoints(0, 1, out colPtr);
    var col = (IMMDeviceCollection)Marshal.GetObjectForIUnknown(colPtr);
    uint n; col.GetCount(out n);
    IntPtr defPtr; e.GetDefaultAudioEndpoint(0, 1, out defPtr);
    var def = (IMMDevice)Marshal.GetObjectForIUnknown(defPtr);
    string defId; def.GetId(out defId);
    for (uint i = 0; i < n; i++) {
      IntPtr dp; col.Item(i, out dp);
      var d = (IMMDevice)Marshal.GetObjectForIUnknown(dp);
      string id; d.GetId(out id);
      IntPtr psPtr; d.OpenPropertyStore(0, out psPtr);
      var ps = (IPropertyStore)Marshal.GetObjectForIUnknown(psPtr);
      PROPVARIANT pv; ps.GetValue(ref NameKey, out pv);
      string name = Marshal.PtrToStringUni(pv.p);
      var iid = typeof(IAudioEndpointVolume).GUID; IntPtr vp;
      d.Activate(ref iid, 1, IntPtr.Zero, out vp);
      var v = (IAudioEndpointVolume)Marshal.GetObjectForIUnknown(vp);
      float lvl; v.GetMasterVolumeLevelScalar(out lvl);
      bool mute; v.GetMute(out mute);
      Console.WriteLine("{0}: {1} vol={2:P0} mute={3}{4}", i, name, lvl, mute, id == defId ? " [DEFAULT]" : "");
    }
  }
  public static void SetByIdx(uint idx, float lvl) {
    var e = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
    IntPtr colPtr; e.EnumAudioEndpoints(0, 1, out colPtr);
    var col = (IMMDeviceCollection)Marshal.GetObjectForIUnknown(colPtr);
    IntPtr dp; col.Item(idx, out dp);
    var d = (IMMDevice)Marshal.GetObjectForIUnknown(dp);
    var iid = typeof(IAudioEndpointVolume).GUID; IntPtr vp;
    d.Activate(ref iid, 1, IntPtr.Zero, out vp);
    var v = (IAudioEndpointVolume)Marshal.GetObjectForIUnknown(vp);
    v.SetMute(false, Guid.Empty);
    v.SetMasterVolumeLevelScalar(lvl, Guid.Empty);
  }
}
