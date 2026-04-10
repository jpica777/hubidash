interface ColorPickerProps {
  color?: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

const PRESETS: string[] = [
  '#ffffff', '#ffe8a1', '#ffd580', '#ff8c42',
  '#ff4444', '#ff44cc', '#9444ff', '#4477ff',
  '#44aaff', '#44ffaa', '#44ff44', '#888888',
];

export default function ColorPicker({ color, onChange, disabled }: ColorPickerProps) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs text-muted">Color</span>
      <div className="grid grid-cols-6 gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => !disabled && onChange(preset)}
            disabled={disabled}
            title={preset}
            className={`w-7 h-7 rounded-full border-2 transition-all duration-150 ${
              color === preset
                ? 'border-white scale-110 shadow-lg'
                : 'border-transparent hover:border-white/50 hover:scale-105'
            } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            style={{ backgroundColor: preset }}
          />
        ))}
      </div>
    </div>
  );
}
