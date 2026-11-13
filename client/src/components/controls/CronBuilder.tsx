import { useState } from 'react';
import { buildCron, describeCron, parseCron, type CronPreset } from '../../utils/automationHelpers';

interface CronBuilderProps {
  value: string;
  onChange: (cron: string) => void;
  timezone?: string;
}

const PRESETS: Array<{ id: CronPreset; label: string }> = [
  { id: 'hourly', label: 'Every hour' },
  { id: 'daily', label: 'Daily at…' },
  { id: 'weekdays', label: 'Weekdays at…' },
  { id: 'custom', label: 'Custom cron' },
];

export function CronBuilder({ value, onChange, timezone }: CronBuilderProps) {
  const parsed = parseCron(value);
  // Remember "custom" even when the typed expression happens to match a preset.
  const [forceCustom, setForceCustom] = useState(parsed.preset === 'custom' && value.trim() !== '');
  const preset: CronPreset = forceCustom ? 'custom' : parsed.preset;
  const [time, setTime] = useState(parsed.preset === 'daily' || parsed.preset === 'weekdays' ? parsed.time : '08:00');

  const selectPreset = (next: CronPreset) => {
    if (next === 'custom') {
      setForceCustom(true);
      if (!value.trim()) onChange('0 8 * * *');
      return;
    }
    setForceCustom(false);
    onChange(buildCron(next, time));
  };

  const changeTime = (next: string) => {
    setTime(next);
    if (preset === 'daily' || preset === 'weekdays') onChange(buildCron(preset, next));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => selectPreset(p.id)}
            className={`rounded-xl border px-3 py-2 text-sm transition-all duration-300 ease-in-out ${
              preset === p.id
                ? 'border-accent/50 bg-accent/20 text-white'
                : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.07]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {(preset === 'daily' || preset === 'weekdays') && (
        <input
          type="time"
          value={time}
          onChange={(e) => e.target.value && changeTime(e.target.value)}
          className="field w-40"
          aria-label="Time"
        />
      )}

      {preset === 'custom' && (
        <div>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0 23 * * *"
            spellCheck={false}
            className="field w-full font-mono"
            aria-label="Cron expression"
          />
          <p className="mt-1 text-xs text-slate-500">minute · hour · day-of-month · month · day-of-week</p>
        </div>
      )}

      <p className="text-xs text-slate-400">
        {describeCron(value)}
        {timezone ? <span className="text-slate-500"> · {timezone}</span> : null}
      </p>
    </div>
  );
}
