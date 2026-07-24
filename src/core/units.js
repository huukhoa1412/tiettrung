/**
 * Formatting helpers. Everything in this app is SI; these functions exist to
 * make sure a number never reaches the screen without its unit attached, which
 * is the single most common source of confusion in a heat-transfer course.
 */

/** Format a number with a fixed number of significant figures. */
export function sig(value, digits = 3) {
  if (!Number.isFinite(value)) return '--';
  if (value === 0) return '0';
  const mag = Math.floor(Math.log10(Math.abs(value)));
  // Outside this window, fixed notation stops being readable.
  if (mag >= 5 || mag <= -4) {
    return value.toExponential(Math.max(0, digits - 1)).replace('e', ' x 10^');
  }
  const decimals = Math.max(0, digits - 1 - mag);
  return value.toFixed(Math.min(decimals, 6));
}

/** Fixed-decimal format that keeps a stable width, so readouts do not jitter. */
export function fixed(value, decimals = 1) {
  return Number.isFinite(value) ? value.toFixed(decimals) : '--';
}

/** Temperature with unit. */
export function degC(value, decimals = 1) {
  return `${fixed(value, decimals)} °C`;
}

/**
 * Time, chosen automatically between seconds, minutes and hours.
 * Process times in this app span 15 s (HTST hold) to several hours (retort),
 * so a single unit would be unreadable at one end or the other.
 */
export function duration(seconds, decimals = 1) {
  if (!Number.isFinite(seconds)) return '--';
  if (Math.abs(seconds) < 90) return `${fixed(seconds, decimals)} s`;
  if (Math.abs(seconds) < 5400) return `${fixed(seconds / 60, decimals)} min`;
  return `${fixed(seconds / 3600, decimals)} h`;
}

/** Time as mm:ss, for the playback scrubber where a stable format matters. */
export function clock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Dimensionless groups: no unit, but they deserve consistent precision. */
export function dimensionless(value, decimals = 3) {
  if (!Number.isFinite(value)) return '--';
  if (Math.abs(value) >= 1000) return value.toExponential(2).replace('e', ' x 10^');
  if (Math.abs(value) < 0.001 && value !== 0) return value.toExponential(2).replace('e', ' x 10^');
  return value.toFixed(decimals);
}

/** Length, switching to millimetres below 10 cm where that reads better. */
export function length(metres, decimals = 1) {
  if (!Number.isFinite(metres)) return '--';
  return Math.abs(metres) < 0.1
    ? `${fixed(metres * 1000, decimals)} mm`
    : `${fixed(metres, 3)} m`;
}

/** Power, scaling to kW and MW. */
export function power(watts, decimals = 1) {
  if (!Number.isFinite(watts)) return '--';
  const a = Math.abs(watts);
  if (a >= 1e6) return `${fixed(watts / 1e6, decimals)} MW`;
  if (a >= 1e3) return `${fixed(watts / 1e3, decimals)} kW`;
  return `${fixed(watts, decimals)} W`;
}

/** Clamp helper used by the sliders. */
export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

/** Unit strings, kept in one place so labels never drift apart. */
export const UNITS = {
  k: 'W·m⁻¹·K⁻¹',
  rho: 'kg·m⁻³',
  cp: 'J·kg⁻¹·K⁻¹',
  h: 'W·m⁻²·K⁻¹',
  U: 'W·m⁻²·K⁻¹',
  alpha: 'm²·s⁻¹',
  T: '°C',
  m: 'm',
  mm: 'mm',
  area: 'm²',
  mdot: 'kg·s⁻¹',
  time: 's',
  minutes: 'min',
  power: 'W',
  latent: 'J·kg⁻¹',
};
