export const money = (value) =>
  Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const qty = (value) =>
  Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const today = () => new Date().toLocaleDateString('en-CA');

export const YD_TO_M = 0.9144;
export const SYMBOL = { CNY: '¥', PKR: 'Rs' };
export const cur = (value, code = 'PKR') => `${SYMBOL[code] || code} ${money(value)}`;
export const toMeters = (yards) => Number(yards || 0) * YD_TO_M;
export const lineAmount = (yards, rate, unit) =>
  Math.round(Number(yards || 0) * (unit === 'meter' ? YD_TO_M : 1) * Number(rate || 0) * 100) / 100;