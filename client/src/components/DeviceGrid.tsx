import { Device, CommandRequest } from '../types/devices';
import DeviceCard from './DeviceCard';

interface DeviceGridProps {
  devices: Device[];
  onSendCommand: (deviceId: string, cmd: CommandRequest) => Promise<boolean>;
  stale?: boolean;
}

export default function DeviceGrid({ devices, onSendCommand, stale }: DeviceGridProps) {
  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="text-4xl mb-4">📡</span>
        <p className="text-muted">No devices found</p>
        <p className="text-xs text-muted/60 mt-1">Try adjusting your filter or search term</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {devices.map((device) => (
        <DeviceCard
          key={device.id}
          device={device}
          onSendCommand={(cmd: CommandRequest) => onSendCommand(device.id, cmd)}
          stale={stale}
        />
      ))}
    </div>
  );
}
