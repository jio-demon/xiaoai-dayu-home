import { useState } from 'react';

export function Login(props: { needsSetup: boolean; onLogin: (pw: string, setup: boolean) => Promise<boolean> }) {
  const { needsSetup, onLogin } = props;
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr('');
    if (needsSetup) {
      if (pw.length < 4) { setErr('密码至少 4 位'); return; }
      if (pw !== pw2) { setErr('两次输入不一致'); return; }
    } else if (!pw) { setErr('请输入密码'); return; }
    setBusy(true);
    const ok = await onLogin(pw, needsSetup);
    setBusy(false);
    if (!ok) setErr(needsSetup ? '设置失败：可能已在设备端设置过密码' : '密码错误或设备不可达');
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h2>{needsSetup ? '首次使用：设置管理密码' : '管理登录'}</h2>
        <p className="dim">{needsSetup ? '该密码用于保护 API 密钥与记忆数据，仅保存在设备本地。' : '输入设备端设置的管理密码。'}</p>
        <input type="password" className="text-input" placeholder={needsSetup ? '新密码（≥4位）' : '管理密码'}
          value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !needsSetup && void submit()} />
        {needsSetup && (
          <input type="password" className="text-input" placeholder="再输入一次"
            value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} />
        )}
        <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
          {busy ? '请稍候…' : needsSetup ? '设置并进入' : '登录'}
        </button>
        {err && <p className="err">{err}</p>}
      </div>
    </div>
  );
}
