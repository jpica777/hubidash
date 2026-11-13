import { useEffect, useRef, useState } from 'react';
import { hexToHsv } from '../../utils/deviceHelpers';

export interface HubitatColor {
  hue: number;
  saturation: number;
  level: number;
}

interface ColorPickerProps {
  /** Current color as #rrggbb. */
  color: string;
  /** Current brightness (0-100), preserved when the hue changes. */
  level: number;
  onCommit: (color: HubitatColor) => Promise<unknown>;
  label: string;
  disabled?: boolean;
}

const COMMIT_DELAY_MS = 450;
const PRESETS = ['#ff6b4a', '#ffb347', '#ffe08a', '#7ee081', '#4fc3f7', '#8b7cf6', '#ff7eb6', '#ffffff'];

export function ColorPicker({ color, level, onCommit, label, disabled = false }: ColorPickerProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const current = draft ?? color;

  const commit = (hex: string, immediate = false) => {
    setDraft(hex);
    if (timer.current !== null) window.clearTimeout(timer.current);
    const run = () => {
      timer.current = null;
      const { h, s } = hexToHsv(hex);
      const payload: HubitatColor = {
        hue: Math.round((h / 360) * 100),
        saturation: Math.round(s * 100),
        level: Math.max(1, Math.round(level)),
      };
      void onCommit(payload).finally(() => setDraft((d) => (d === hex ? null : d)));
    };
    if (immediate) run();
    else timer.current = window.setTimeout(run, COMMIT_DELAY_MS);
  };

  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={current}
        disabled={disabled}
        aria-label={`${label} color`}
        onChange={(e) => commit(e.target.value)}
        className="swatch h-8 w-8 shrink-0"
      />
      <div className="flex flex-1 flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            aria-label={`Set ${label} to ${preset}`}
            onClick={() => commit(preset, true)}
            className={`h-5 w-5 rounded-full border transition-transform duration-300 ease-in-out hover:scale-110 disabled:opacity-50 ${
              current.toLowerCase() === preset ? 'border-white' : 'border-white/20'
            }`}
            style={{ backgroundColor: preset }}
          />
        ))}
      </div>
    </div>
  );
}
