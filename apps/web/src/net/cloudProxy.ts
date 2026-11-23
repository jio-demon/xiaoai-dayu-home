/**
 * 同源云代理：把 API URL 改写到页面所在服务器的 /cloud-proxy/，绕开浏览器 CORS。
 * PC 模拟由 vite 中间件转发；真机由薄壳 HttpServer(Kotlin) 转发（WebView 与管理页都受益）。
 *   https://<公网域名>/...        → /cloud-proxy/<host>/...        （dev server 走 https 转发）
 *   http://<局域网IP>:<端口>/...  → /cloud-proxy/<host>:<port>/... （dev server 走 http 转发）
 * localhost/127.* 与相对地址不改写；页面本身是 https 时不代理 http 目标（避免混合内容语义变化）。
 * 真机与生产构建不受影响（由原生层处理）。
 */
const HTTPS_HOST = /^https:\/\/([a-z0-9.-]+\.[a-z]{2,})(\/.*)?$/i;
const HTTP_LAN = /^http:\/\/([a-z0-9.-]+:\d{1,5})(\/.*)?$/i;

export function cloudUrl(url: string): string {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return url;
  const m = HTTPS_HOST.exec(url);
  if (m) {
    const host = m[1];
    if (/^(localhost|127\.)/i.test(host)) return url;
    return `${location.origin}/cloud-proxy/${host}${m[2] || '/'}`;
  }
  // 局域网自建 OpenAI 兼容网关（http + 端口）：同样可能被 CORS 拦截，走代理
  const l = HTTP_LAN.exec(url);
  if (l && location.protocol === 'http:') {
    const authority = l[1];
    if (/^(localhost|127\.)/i.test(authority)) return url;
    if (authority === location.host) return url;
    return `${location.origin}/cloud-proxy/${authority}${l[2] || '/'}`;
  }
  // 无端口的局域网 http（如 http://192.168.31.2/v1）：IP 直连也走代理
  const p = /^http:\/\/(\d{1,3}(?:\.\d{1,3}){3})(\/.*)?$/i.exec(url);
  if (p && location.protocol === 'http:' && p[1] !== location.hostname) {
    return `${location.origin}/cloud-proxy/${p[1]}:80${p[2] || '/'}`;
  }
  return url;
}

let installed = false;
/** 全局 fetch 包装：安装一次；对上层代码透明（相对地址与本机地址不受影响）。 */
export function installCloudProxyFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      if (typeof input === 'string') return orig(cloudUrl(input), init);
      if (input instanceof URL) return orig(new URL(cloudUrl(input.href)), init);
      const rewritten = cloudUrl(input.url);
      if (rewritten !== input.url) return orig(new Request(rewritten, input), init);
    } catch { /* 改写失败则原样请求 */ }
    return orig(input as any, init);
  }) as typeof window.fetch;
}
