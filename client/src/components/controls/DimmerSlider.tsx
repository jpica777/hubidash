interface DimmerSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export default function DimmerSlider({ value, onChange, disabled }: DimmerSliderProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Brightness</span>
        <span className="text-xs font-mono text-white">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        disabled={disabled}
        className="w-full h-1.5 accent-accent rounded-full bg-surface-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}
