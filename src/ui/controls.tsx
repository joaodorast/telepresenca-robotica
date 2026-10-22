import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-white/60">{label}</span>
        <span className="font-mono text-[11px] text-white/80">{format ? format(value) : value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        className="range"
        style={{ ['--fill' as string]: fill }}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 py-1.5 text-left" aria-pressed={checked}>
      <span>
        <span className="block text-sm text-white/85">{label}</span>
        {hint && <span className="block text-xs text-white/40">{hint}</span>}
      </span>
      <span className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-gold-500' : 'bg-white/15')}>
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

/** Medidor de nível que lê um valor real a cada quadro sem re-renderizar o React. */
export function LevelBar({ read, active = true, segments = 18, className }: { read: () => number; active?: boolean; segments?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const el = ref.current;
      if (el) {
        const lit = active ? Math.round(read() * segments) : 0;
        const kids = el.children;
        for (let i = 0; i < kids.length; i++) {
          const k = kids[i] as HTMLElement;
          k.style.opacity = i < lit ? '1' : '0.14';
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [read, active, segments]);
  return (
    <div ref={ref} className={cx('flex h-2 items-stretch gap-[3px]', className)}>
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className="flex-1 rounded-[2px] transition-opacity duration-75"
          style={{ background: i > segments * 0.85 ? '#ff6b5a' : i > segments * 0.65 ? '#ffd27a' : '#f3ba5c', opacity: 0.14 }}
        />
      ))}
    </div>
  );
}

export function Button({
  variant = 'ghost',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'gold' | 'danger' | 'subtle'; children: ReactNode }) {
  const styles = {
    ghost: 'border border-white/10 bg-white/[0.03] text-white/85 hover:border-white/20 hover:bg-white/[0.07]',
    subtle: 'text-white/60 hover:bg-white/5 hover:text-white',
    gold: 'bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 shadow-glow hover:brightness-110',
    danger: 'bg-gradient-to-b from-[#ff5a4f] to-[#d93a32] text-white shadow-[0_8px_30px_-10px_rgba(255,80,70,.7)] hover:brightness-110',
  }[variant];
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-40',
        styles,
        className,
      )}
    >
      {children}
    </button>
  );
}

export type Tone = 'ok' | 'warn' | 'error' | 'idle' | 'info';
const toneColor: Record<Tone, string> = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  error: 'bg-red-500',
  idle: 'bg-white/30',
  info: 'bg-sky-400',
};

export function Dot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  return <span className={cx('inline-block h-2 w-2 shrink-0 rounded-full', toneColor[tone], pulse && tone === 'ok' && 'live-dot')} />;
}

export function Notice({ tone = 'warn', children, action }: { tone?: 'warn' | 'error' | 'info'; children: ReactNode; action?: ReactNode }) {
  const c = {
    warn: 'border-amber-400/25 bg-amber-400/[0.07] text-amber-100',
    error: 'border-red-500/30 bg-red-500/[0.08] text-red-100',
    info: 'border-sky-400/25 bg-sky-400/[0.06] text-sky-100',
  }[tone];
  return (
    <div className={cx('flex items-start justify-between gap-3 rounded-xl border px-3 py-2 text-xs leading-relaxed', c)}>
      <div>{children}</div>
      {action}
    </div>
  );
}
