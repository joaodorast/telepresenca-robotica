export function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-gold-400/40 bg-ink-900 shadow-glow">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path d="M3 16 L12 6 L21 16 L16.5 16 L12 11 L7.5 16Z" fill="#f3ba5c" />
        </svg>
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block font-display text-[13px] font-semibold tracking-[0.2em]">TELEPRESENÇA</span>
          <span className="block text-[11px] tracking-[0.18em] text-white/40">ROBÓTICA</span>
        </span>
      )}
    </div>
  );
}
