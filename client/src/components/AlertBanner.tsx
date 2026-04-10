import { Device } from '../types/devices';
import { isBatteryLow, getBatteryLevel } from '../utils/deviceHelpers';

interface AlertBannerProps {
  devices: Device[];
}

function alertText(device: Device): string {
  if (isBatteryLow(device)) return `Low battery (${getBatteryLevel(device)}%)`;
  if (device.attributes['water'] === 'wet') return 'Water detected';
  if (device.attributes['lock'] === 'unlocked') return 'Unlocked';
  return 'Alert';
}

export default function AlertBanner({ devices }: AlertBannerProps) {
  if (devices.length === 0) return null;

  return (
    <div className="mx-4 mt-4 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <span className="text-red-400 mt-0.5 shrink-0">⚠</span>
        <div>
          <p className="text-sm font-medium text-red-400 mb-1">
            {devices.length === 1 ? '1 device alert' : `${devices.length} device alerts`}
          </p>
          <ul className="text-sm text-red-300 space-y-0.5">
            {devices.map((d) => (
              <li key={d.id}>
                <span className="font-medium">{d.label}</span>: {alertText(d)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
