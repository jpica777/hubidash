import { useEffect, useMemo, useState } from 'react';
import type { CategoryFilter, Device, DeviceCategory, HubitatMode } from '../types/devices';
import { detectKind, displayName, getAlerts, getCategory } from '../utils/deviceHelpers';
import { useDevices } from '../hooks/useDevices';
import { Header } from './Header';
import { AlertBanner } from './AlertBanner';
import { FilterBar } from './FilterBar';
import { DeviceGrid } from './DeviceGrid';

interface DashboardProps {
  wsToken: string;
  mode: HubitatMode | null;
  onLogout: () => void;
  onSessionExpired: () => void;
}

const CATEGORY_KEY = 'hubidash.category';

function readStoredCategory(): CategoryFilter {
  try {
    const stored = window.localStorage.getItem(CATEGORY_KEY);
    if (stored && ['all', 'lights', 'sensors', 'locks', 'climate', 'other'].includes(stored)) {
      return stored as CategoryFilter;
    }
  } catch {
    // storage unavailable (private mode etc.)
  }
  return 'all';
}

export function Dashboard({ wsToken, mode, onLogout, onSessionExpired }: DashboardProps) {
  const { devices, loaded, loadError, stale, lastUpdated, connection, sendCommand, commandError, dismissCommandError } =
    useDevices({ wsToken, onUnauthorized: onSessionExpired });

  const [category, setCategory] = useState<CategoryFilter>(readStoredCategory);
  const [search, setSearch] = useState('');

  useEffect(() => {
    try {
      window.localStorage.setItem(CATEGORY_KEY, category);
    } catch {
      // ignore
    }
  }, [category]);

  // Auto-dismiss command errors.
  useEffect(() => {
    if (!commandError) return undefined;
    const timer = window.setTimeout(dismissCommandError, 5_000);
    return () => window.clearTimeout(timer);
  }, [commandError, dismissCommandError]);

  const categorized = useMemo(
    () => devices.map((device) => ({ device, category: getCategory(detectKind(device)) })),
    [devices],
  );

  const counts = useMemo(() => {
    const result: Record<CategoryFilter, number> = { all: 0, lights: 0, sensors: 0, locks: 0, climate: 0, other: 0 };
    for (const { category: c } of categorized) {
      result.all += 1;
      result[c] += 1;
    }
    return result;
  }, [categorized]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return categorized
      .filter(({ category: c }) => category === 'all' || c === (category as DeviceCategory))
      .filter(({ device }) => !query || displayName(device).toLowerCase().includes(query))
      .map(({ device }) => device);
  }, [categorized, category, search]);

  const bannerAlerts = useMemo(() => devices.flatMap((d: Device) => getAlerts(d).filter((a) => a.banner)), [devices]);

  let emptyMessage = 'No devices in this category.';
  if (search.trim()) emptyMessage = `No devices match "${search.trim()}".`;
  else if (devices.length === 0 && stale) emptyMessage = 'Hub unreachable — waiting for it to come back online…';
  else if (devices.length === 0) emptyMessage = 'No devices found. Check which devices are enabled in the Maker API app.';

  return (
    <div className="min-h-screen">
      <AlertBanner alerts={bannerAlerts} />
      <Header mode={mode} connection={connection} lastUpdated={lastUpdated} stale={stale} onLogout={onLogout} />

      <main className="mx-auto max-w-screen-2xl space-y-5 px-4 py-5 sm:px-6">
        <FilterBar
          category={category}
          onCategoryChange={setCategory}
          search={search}
          onSearchChange={setSearch}
          counts={counts}
        />

        {!loaded && !loadError && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="glass h-40 animate-pulse" />
            ))}
          </div>
        )}

        {!loaded && loadError && (
          <div className="glass border-rose-500/30 px-6 py-10 text-center">
            <p className="font-medium text-rose-200">{loadError}</p>
            <p className="mt-1 text-sm text-slate-400">Retrying automatically while the live connection reconnects.</p>
          </div>
        )}

        {loaded && <DeviceGrid devices={visible} onCommand={sendCommand} emptyMessage={emptyMessage} />}
      </main>

      {commandError && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div
            role="status"
            className="glass flex max-w-md items-center gap-3 border-rose-500/40 bg-rose-950/80 px-4 py-3 text-sm text-rose-100 shadow-xl animate-fade-in"
          >
            <span className="flex-1">{commandError}</span>
            <button
              type="button"
              onClick={dismissCommandError}
              className="text-rose-300 transition-colors duration-300 hover:text-white"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
