import { DeviceCategory } from '../types/devices';

interface FilterBarProps {
  selectedCategory: DeviceCategory;
  onCategoryChange: (category: DeviceCategory) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const CATEGORIES: { value: DeviceCategory; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: '⊞' },
  { value: 'lights', label: 'Lights', icon: '💡' },
  { value: 'sensors', label: 'Sensors', icon: '📡' },
  { value: 'locks', label: 'Locks', icon: '🔒' },
  { value: 'climate', label: 'Climate', icon: '🌡️' },
  { value: 'other', label: 'Other', icon: '📱' },
];

export default function FilterBar({
  selectedCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
}: FilterBarProps) {
  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(({ value, label, icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => onCategoryChange(value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
              selectedCategory === value
                ? 'bg-accent text-white'
                : 'bg-surface-2 border border-border text-muted hover:text-white hover:border-accent/40'
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <input
        type="search"
        placeholder="Search devices…"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full max-w-xs px-4 py-2 rounded-lg bg-surface-2 border border-border text-white placeholder-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition"
      />
    </div>
  );
}
