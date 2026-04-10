interface ThermostatControlProps {
  temperature?: number;
  setpoint?: number;
  mode: string;
  onModeChange: (mode: string) => void;
  onSetpointChange: (temp: number) => void;
  disabled?: boolean;
}

const MODES = ['off', 'heat', 'cool', 'auto'] as const;

export default function ThermostatControl({
  temperature,
  setpoint,
  mode,
  onModeChange,
  onSetpointChange,
  disabled,
}: ThermostatControlProps) {
  const sp = setpoint ?? 70;

  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Mode</span>
        <div className="flex gap-1">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => !disabled && onModeChange(m)}
              disabled={disabled}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                mode === m
                  ? 'bg-accent text-white'
                  : 'bg-surface-2 border border-border text-muted hover:text-white'
              } disabled:opacity-50`}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Setpoint control */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Set to</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => !disabled && mode !== 'off' && onSetpointChange(sp - 1)}
            disabled={disabled || mode === 'off'}
            className="w-6 h-6 rounded-full bg-surface-2 border border-border text-white flex items-center justify-center text-sm hover:border-accent/60 disabled:opacity-40 transition-colors"
          >
            −
          </button>
          <span className="text-sm font-mono text-white w-14 text-center">
            {mode === 'off' ? '—' : `${sp}°F`}
          </span>
          <button
            type="button"
            onClick={() => !disabled && mode !== 'off' && onSetpointChange(sp + 1)}
            disabled={disabled || mode === 'off'}
            className="w-6 h-6 rounded-full bg-surface-2 border border-border text-white flex items-center justify-center text-sm hover:border-accent/60 disabled:opacity-40 transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* Current temperature (read-only) */}
      {temperature !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Current</span>
          <span className="text-xs font-mono text-gray-300">{temperature}°F</span>
        </div>
      )}
    </div>
  );
}
