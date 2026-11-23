import { useEffect, useState } from 'react';

export function Subtitles(props: { text: string; speaker: 'user' | 'ai' }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    setShown(true);
    const t = setTimeout(() => setShown(false), 6500);
    return () => clearTimeout(t);
  }, [props.text]);
  if (!shown) return null;
  return (
    <div className={`subtitles sub-${props.speaker}`} key={props.text}>
      <span className="sub-name">{props.speaker === 'user' ? '你' : '大肥鱼'}</span>
      <span className="sub-text">{props.text}</span>
    </div>
  );
}
