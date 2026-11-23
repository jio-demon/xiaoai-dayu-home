import { useState } from 'react';
import { useAdmin } from './AdminApp';

export function UpdatePage() {
  const { api } = useAdmin();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.endsWith('.zip')) { setMsg('请选择 dist 打包的 .zip 文件'); return; }
    setBusy(true); setMsg('');
    try {
      const { hash } = await api.uploadBundle(file);
      setMsg(`上传成功（${hash.slice(0, 16)}…）。点击「重载界面」后生效。`);
    } catch (e) { setMsg(`上传失败：${(e as Error).message}`); }
    setBusy(false);
  };

  return (
    <div className="page">
      <h2>界面固件更新</h2>
      <p className="dim">只更新 Web 界面（热更新），不动 Android 系统。APK 薄壳需刷机时一并安装。</p>
      <section className="card">
        <h3>上传新界面包</h3>
        <ol className="steps">
          <li>电脑上执行 <code>npm run build</code>，得到 <code>apps/web/dist</code></li>
          <li>把 <code>dist</code> 里的内容压缩为 zip（index.html 在压缩包根部）</li>
          <li>在这里上传，设备校验后切换新包并自动重载</li>
        </ol>
        <input type="file" accept=".zip" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
        {busy && <p>上传中…</p>}
        {msg && <p className="save-msg">{msg}</p>}
        {api.kind === 'mock' && <p className="dim">PC 模拟模式：仅记录包信息，不真正替换文件。</p>}
        <div className="save-bar">
          <button className="btn" onClick={() => api.command({ cmd: 'reload' })}>重载界面</button>
        </div>
      </section>
      <section className="card">
        <h3>回滚</h3>
        <p className="dim">真机保留最近 3 个界面包；若新包 30 秒内未上报状态，薄壳自动回滚到上一包。也可通过 ADB 删除 /data/data/com.xiaoai.shell/files/bundles 下最新目录。</p>
      </section>
    </div>
  );
}
