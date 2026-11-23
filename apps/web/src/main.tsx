import './net/domPolyfill';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DeviceApp } from './device/DeviceApp';
import { AdminApp } from './admin/AdminApp';
import './styles.css';
import { installCloudProxyFetch } from './net/cloudProxy';

// 云 API 走同源代理绕 CORS：PC 模拟=vite 代理；真机 WebView=薄壳 :8080 代理。
// 手机/电脑浏览器直连真机管理页时也安装（跨源 fetch 云 API 会被 CORS 拦截）。
installCloudProxyFetch();

function useHashRoute(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

function Root() {
  const hash = useHashRoute();
  return hash.startsWith('#/admin') ? <AdminApp /> : <DeviceApp />;
}

createRoot(document.getElementById('root')!).render(<Root />);
