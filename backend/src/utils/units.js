import { r2 } from './money.js';

export const METERS_PER_YARD = 0.9144;

export const rateFactor = (unit) => (unit === 'meter' ? METERS_PER_YARD : 1);

export const lineAmount = (yards, rate, unit) => r2(yards * rateFactor(unit) * rate);