import { useState, useMemo } from 'react';
import { useDevices } from '../hooks/useDevices';
import { useWebSocket } from '../hooks/useWebSocket';
import { DeviceCategory } from '../types/devices';
import { getDeviceCategory, hasAlerts } from '../utils/deviceHelpers';
import Header from './Header';
import FilterBar from './FilterBar';
import DeviceGrid from './DeviceGrid';
import AlertBanner from './AlertBanner';

interface DashboardProps {
  wsToken: string | null;
  onLogout: () => void;
}

export default function Dashboard({ wsToken, onLogout }: DashboardProps) {
  const {
    devices,
    lastUpdated,
    stale,
    initialized,
    handleFullState,
    handleDeviceUpdates,
    sendCommand,
  } = useDevices();

  const { status: wsStatus } = useWebSocket({
    wsToken,
    onFullState: handleFullState,
    onDeviceUpdates: handleDeviceUpdates,
  });

  const [selectedCategory, setSelectedCategory] = useState<DeviceCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDevices = useMemo(
    () =>
      devices.filter((device) => {
        const matchesCategory =
          selectedCategory === 'all' || getDeviceCategory(device) === selectedCategory;
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          device.label.toLowerCase().includes(q) || device.name.toLowerCase().includes(q);
        return matchesCategory && matchesSearch;
      }),
    [devices, selectedCategory, searchQuery]
  );

  const alertDevices = useMemo(() => devices.filter(hasAlerts), [devices]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-muted text-sm">Connecting to hub…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        wsStatus={wsStatus}
        lastUpdated={lastUpdated}
        stale={stale}
        onLogout={onLogout}
      />

      {alertDevices.length > 0 && <AlertBanner devices={alertDevices} />}

      <main className="container mx-auto px-4 py-6">
        <FilterBar
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <DeviceGrid
          devices={filteredDevices}
          onSendCommand={sendCommand}
          stale={stale}
        />
      </main>
    </div>
  );
}
