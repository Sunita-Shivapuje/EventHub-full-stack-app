export const CURRENCY = import.meta.env.VITE_CURRENCY || 'USD';
export const MAX_TICKETS = 10;

const moneyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY });

export const money = (cents) => (cents === 0 ? 'Free' : moneyFmt.format(cents / 100));


export function priceToCents(str) {
  const s = String(str).trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}
export const centsToInput = (c) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;

const dtFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const formatDateTime = (iso) => dtFmt.format(new Date(iso));
export const formatTime = (iso) => new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(iso));
export const timeZoneName = () =>
  new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || '';

export const toLocalInput = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : '');
export const startOfDayISO = (yyyyMmDd) => new Date(`${yyyyMmDd}T00:00:00`).toISOString();
export const endOfDayISO = (yyyyMmDd) => new Date(`${yyyyMmDd}T23:59:59.999`).toISOString();

export const newIdempotencyKey = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const availabilityLabel = (e) => {
  if (e.status !== 'published') return null;
  if (e.remaining <= 0) return 'Sold out';
  if (e.remaining <= 10) return `Only ${e.remaining} left`;
  return `${e.remaining} left`;
};
