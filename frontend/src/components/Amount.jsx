import { cur } from '../lib/format.js';

export default function Amount({ value, currency = 'PKR', rate = 0, className = '' }) {
  return (
    <span className={className}>
      <span>{cur(value, currency)}</span>
      {currency === 'CNY' && rate > 0 && (
        <span className="block text-[11px] font-normal text-slate-500">≈ {cur(Number(value) * rate, 'PKR')}</span>
      )}
    </span>
  );
}