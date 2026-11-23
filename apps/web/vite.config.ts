import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import https from 'node:https';
import http from 'node:http';

// 目标 chrome64：兼容 LX04 可升级到的旧版 WebView（可选链等语法会被转译）。

/**
 * PC 模拟专用 API 代理：
 *   /cloud-proxy/<host>/<path>       → https://<host>/<path>（公网云 API）
 *   /cloud-proxy/<host>:<port>/<path> → http://<host>:<port>/<path>（局域网自建网关，如 OpenAI 兼容中转）
 * 绕开浏览器 CORS 限制（Failed to fetch 的主因）。
 * 用原生 http/https 流式转发（vite 内置 http-proxy 对大 multipart 上传会 ECONNRESET）。
 */
function cloudProxyPlugin(): Plugin {
  const middleware = (req: any, res: any, next: any) => {
    const m = /^\/cloud-proxy\/([a-z0-9.-]+(?::\d{1,5})?)(\/.*)?$/i.exec(req.url || '');
    if (!m) return next();
    const authority = m[1];
    const path = m[2] || '/';
    // 带端口 = 局域网 http 网关；不带端口 = 公网 https
    const pm = /^(.+):(\d{1,5})$/.exec(authority);
    const hostname = pm ? pm[1] : authority;
    const port = pm ? Number(pm[2]) : 443;
    const mod = pm ? http : https;
    const headers: Record<string, string | string[] | undefined> = { ...req.headers, host: authority };
    delete headers['connection']; delete headers['proxy-connection'];
    delete headers['origin']; delete headers['referer'];
    // 瞬时网络错误（ECONNRESET/ETIMEDOUT 等）自动重试：幂等 GET 最多 3 次，指数退避
    const idempotent = req.method === 'GET' || req.method === 'HEAD';
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const attempt = (n: number) => {
        const upstream = mod.request({ hostname, port, path, method: req.method, headers }, (up) => {
          const retryableStatus = up.statusCode === 502 || up.statusCode === 503 || up.statusCode === 504;
          if (idempotent && retryableStatus && n < 2) { up.resume(); setTimeout(() => attempt(n + 1), 400 * (n + 1)); return; }
          const h: Record<string, any> = { ...up.headers };
          delete h['transfer-encoding']; delete h['connection'];
          // 开发场景放开 CORS（仅本机 dev server）
          h['access-control-allow-origin'] = '*';
          res.writeHead(up.statusCode || 502, h);
          up.pipe(res);
        });
        upstream.on('error', (e) => {
          const transient = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|socket hang up/i.test(e.message);
          if (idempotent && transient && n < 2) { setTimeout(() => attempt(n + 1), 400 * (n + 1)); return; }
          if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { message: `cloud-proxy: ${e.message}` } }));
        });
        if (body.length) upstream.write(body);
        upstream.end();
      };
      attempt(0);
    });
  };
  return {
    name: 'xiaoai-cloud-proxy',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default defineConfig({
  plugins: [
    react(),
    // LX04 自带 WebView 是 Chrome 61：esbuild 无法降级 generator/async，需 babel+core-js 出 legacy 包
    legacy({ targets: ['chrome >= 61'], modernPolyfills: true, renderLegacyChunks: true }),
    cloudProxyPlugin(),
  ],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { target: 'chrome64', chunkSizeWarningLimit: 1600 },
});

