import type { DeviceAlert } from '../types/devices';

interface AlertBannerProps {
  alerts: DeviceAlert[];
}

export function AlertBanner({ alerts }: AlertBannerProps) {
  if (alerts.length === 0) return null;

  const hasEmergency = alerts.some((a) => a.kind === 'water' || a.kind === 'smoke' || a.kind === 'co');

  return (
    <div
      role="alert"
      className={`sticky top-0 z-40 border-b backdrop-blur-md animate-fade-in ${
        hasEmergency ? 'border-rose-500/40 bg-rose-950/80' : 'border-amber-500/30 bg-amber-950/70'
      }`}
    >
      <div className="mx-auto flex max-w-screen-2xl items-start gap-3 px-4 py-2.5 sm:px-6">
        <svg
          viewBox="0 0 24 24"
          className={`mt-0.5 h-5 w-5 shrink-0 ${hasEmergency ? 'text-rose-300' : 'text-amber-300'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        <ul className="flex flex-1 flex-wrap gap-x-5 gap-y-1 text-sm">
          {alerts.map((alert) => (
            <li key={`${alert.deviceId}-${alert.kind}`} className="text-slate-100">
              <span className="font-semibold">{alert.deviceName}</span>
              <span className={hasEmergency ? 'text-rose-200' : 'text-amber-200'}> — {alert.message}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
