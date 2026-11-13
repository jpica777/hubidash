/**
 * Sunrise/sunset calculation (standard NOAA-style solar position algorithm,
 * accurate to roughly a minute) so "only if it's dark" conditions work without
 * an external API.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2_440_588;
const J2000 = 2_451_545;
const OBLIQUITY = RAD * 23.4397;
const J0 = 0.0009;
const SUN_ALTITUDE = -0.833 * RAD; // sun's upper limb at the horizon, incl. refraction

const toJulian = (date: Date) => date.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);
const toDays = (date: Date) => toJulian(date) - J2000;

const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
const eclipticLongitude = (m: number) =>
  m + RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m)) + RAD * 102.9372 + Math.PI;
const declination = (l: number) => Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));
const julianCycle = (d: number, lw: number) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (ht: number, lw: number, n: number) => J0 + (ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, m: number, l: number) => J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);

export type SunTimes =
  | { kind: 'normal'; sunrise: Date; sunset: Date }
  | { kind: 'polar_day' }
  | { kind: 'polar_night' };

export function getSunTimes(date: Date, latitude: number, longitude: number): SunTimes {
  const lw = RAD * -longitude;
  const phi = RAD * latitude;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const m = solarMeanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = declination(l);
  const jNoon = solarTransitJ(ds, m, l);

  const cosH = (Math.sin(SUN_ALTITUDE) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosH < -1) return { kind: 'polar_day' };
  if (cosH > 1) return { kind: 'polar_night' };

  const w = Math.acos(cosH);
  const jSet = solarTransitJ(approxTransit(w, lw, n), m, l);
  const jRise = jNoon - (jSet - jNoon);
  return { kind: 'normal', sunrise: fromJulian(jRise), sunset: fromJulian(jSet) };
}

/** True between sunset and the following sunrise. */
export function isDark(now: Date, latitude: number, longitude: number): boolean {
  const times = getSunTimes(now, latitude, longitude);
  if (times.kind === 'polar_day') return false;
  if (times.kind === 'polar_night') return true;
  return now < times.sunrise || now >= times.sunset;
}
