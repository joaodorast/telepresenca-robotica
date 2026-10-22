import type { ExpressionId } from '../shared/protocol';
import { EXPRESSIONS } from './expressions';

/** Ícone vetorial da expressão, desenhado a partir dos mesmos parâmetros usados no 3D. */
export function FaceIcon({ expression, size = 40 }: { expression: ExpressionId; size?: number }) {
  const p = EXPRESSIONS[expression].params;
  const eyeH = 5.4 * p.eyeOpen * (1 - p.lidTop * 0.75) * (1 - p.lidBottom * 0.35);
  const mouthW = 4 + 4.5 * p.width - 2 * p.round;
  const my = 29.5;
  const cy = -2.6 * p.smile;
  const open = 0.6 + 6 * p.open;
  const sk = p.skew * 1.4;
  const brow = (x: number, side: number) => {
    const asym = p.browAsym * side * -1;
    const y = 13.6 - p.browY * 2 - asym * 1.2;
    const ang = (p.browAngle * 2.2 + asym * 0.8) * side;
    return `M${x - 3.2} ${y + ang} Q${x} ${y - 1.4} ${x + 3.2} ${y - ang}`;
  };
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id={`fg-${expression}`} cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#c9c8d2" />
        </radialGradient>
        <radialGradient id="iris" cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor="#5ea0ff" />
          <stop offset="100%" stopColor="#13285c" />
        </radialGradient>
      </defs>
      <rect x="2.5" y="2.5" width="35" height="35" rx="11" fill="#0b0c11" stroke="#f3ba5c" strokeOpacity="0.55" />
      <ellipse cx="20" cy="21.5" rx="12.5" ry="13.2" fill={`url(#fg-${expression})`} />
      <path d="M7.4 20 C7 9 13 5.6 20 5.6 C27 5.6 33 9 32.6 20 C30 14 27 11.6 20 11.6 C13 11.6 10 14 7.4 20Z" fill="#111219" />
      {[14.6, 25.4].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="21" rx="3.6" ry={Math.max(0.35, eyeH)} fill="url(#iris)" />
          {eyeH > 1.2 && <circle cx={x - 1.1} cy={21 - eyeH * 0.35} r="0.9" fill="#fff" />}
        </g>
      ))}
      <path d={brow(14.6, -1)} stroke="#2b2433" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d={brow(25.4, 1)} stroke="#2b2433" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path
        d={`M${20 - mouthW} ${my + cy - sk} Q20 ${my - open * 0.3} ${20 + mouthW} ${my + cy + sk} Q20 ${my + open + Math.max(0, p.smile) * 2.2} ${20 - mouthW} ${my + cy - sk}Z`}
        fill="#3d1522"
      />
    </svg>
  );
}
