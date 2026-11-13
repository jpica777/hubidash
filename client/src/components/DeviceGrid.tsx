import type { CommandFn, Device } from '../types/devices';
import { DeviceCard } from './DeviceCard';

interface DeviceGridProps {
  devices: Device[];
  onCommand: CommandFn;
  emptyMessage: string;
}

export function DeviceGrid({ devices, onCommand, emptyMessage }: DeviceGridProps) {
  if (devices.length === 0) {
    return (
      <div className="glass flex flex-col items-center justify-center gap-2 px-6 py-16 text-center animate-fade-in">
        <p className="text-slate-300">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {devices.map((device) => (
        <DeviceCard key={device.id} device={device} onCommand={onCommand} />
      ))}
    </div>
  );
}
