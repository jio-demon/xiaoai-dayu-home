import type { VoiceState } from '@xiaoai/protocol';

const LABEL: Record<VoiceState, string> = { idle: '唤醒我', listening: '在听…', thinking: '想一想', speaking: '说话中' };

export function VoiceRing(props: { state: VoiceState; level: number; wakeWord: string; onTap: () => void }) {
  const { state, level, wakeWord, onTap } = props;
  return (
    <button className={`voice-ring voice-${state}`} onClick={onTap} aria-label={LABEL[state]}>
      <svg viewBox="0 0 100 100" className="ring-svg">
        <circle cx="50" cy="50" r="44" className="ring-bg" />
        {state === 'listening' && (
          <circle cx="50" cy="50" r={40 + level * 8} className="ring-level" style={{ opacity: 0.25 + level * 0.5 }} />
        )}
        {state === 'thinking' && <circle cx="50" cy="50" r="44" className="ring-spin" />}
        {state === 'speaking' && [0, 1, 2, 3].map((i) => (
          <rect key={i} x={32 + i * 10} y="38" width="5" height="24" rx="2.5" className={`ring-bar bar-${i}`} />
        ))}
        {(state === 'idle' || state === 'listening') && (
          <g className="ring-mic">
            <rect x="44" y="30" width="12" height="24" rx="6" />
            <path d="M38 50 a12 12 0 0 0 24 0" fill="none" strokeWidth="3.5" />
            <line x1="50" y1="62" x2="50" y2="68" strokeWidth="3.5" />
          </g>
        )}
      </svg>
      <span className="ring-label">{state === 'idle' ? `「${wakeWord}」` : LABEL[state]}</span>
    </button>
  );
}
