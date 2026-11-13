import { useEffect, useRef, useState } from 'react';

interface DimmerSliderProps {
  level: number;
  onCommit: (level: number) => Promise<unknown>;
  label: string;
  disabled?: boolean;
}

const COMMIT_DELAY_MS = 350;

export function DimmerSlider({ level, onCommit, label, disabled = false }: DimmerSliderProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const value = draft ?? Math.round(level);

  const handleChange = (next: number) => {
    setDraft(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void onCommit(next).finally(() => setDraft((d) => (d === next ? null : d)));
    }, COMMIT_DELAY_MS);
  };

  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        aria-label={`${label} brightness`}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="slider w-full"
        style={{ ['--fill' as string]: `${value}%` }}
      />
      <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums text-slate-300">{value}%</span>
    </div>
  );
}
