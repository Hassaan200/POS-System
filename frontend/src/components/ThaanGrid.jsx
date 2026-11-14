import { Button, inputClass } from './ui.jsx';
import { lineAmount, toMeters } from '../lib/format.js';

export const PARTS = [
  { part: 'front', label: 'Front' },
  { part: 'back', label: 'Back' },
  { part: 'dupatta', label: 'Dupatta' },
];

export const emptyRow = () => ({ front: '', back: '', dupatta: '' });

export const partYards = (rows, part) =>
  Math.round(rows.reduce((sum, r) => sum + Number(r[part] || 0), 0) * 100) / 100;

export const setTotals = (block) => {
  const parts = PARTS.map(({ part }) => partYards(block.rows, part));
  const yards = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
  const amounts = PARTS.map(({ part }, i) => lineAmount(parts[i], block.rates?.[part], block.unit));
  const amount = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100;
  return { parts, yards, amounts, amount };
};

export function ThaanGrid({ block, onChange }) {
  const { parts, yards, amounts } = setTotals(block);
  const setRate = (part, value) => onChange({ ...block, rates: { ...block.rates, [part]: value } });
  const setCell = (i, part, value) =>
    onChange({ ...block, rows: block.rows.map((r, idx) => (idx === i ? { ...r, [part]: value } : r)) });

  const fill = () => {
    const n = Number(block.fillCount);
    if (!n || n < 1 || n > 200) return;
    const f = block.fillF || '', b = block.fillB || '', d = block.fillD || '';
    onChange({ ...block, rows: Array.from({ length: n }, () => ({ front: f, back: b, dupatta: d })) });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 items-end gap-2 border border-dashed border-slate-300 p-2 text-xs sm:grid-cols-5">
        <label>Thaans<input type="number" min="1" className={inputClass} value={block.fillCount || ''} onChange={(e) => onChange({ ...block, fillCount: e.target.value })} /></label>
        <label>Front<input type="number" step="any" className={inputClass} value={block.fillF || ''} onChange={(e) => onChange({ ...block, fillF: e.target.value })} /></label>
        <label>Back<input type="number" step="any" className={inputClass} value={block.fillB || ''} onChange={(e) => onChange({ ...block, fillB: e.target.value })} /></label>
        <label>Dupatta<input type="number" step="any" className={inputClass} value={block.fillD || ''} onChange={(e) => onChange({ ...block, fillD: e.target.value })} /></label>
        <Button variant="secondary" onClick={fill}>Fill</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr><th className="w-12 px-1 py-1">#</th>{PARTS.map((p) => <th key={p.part} className="px-1 py-1">{p.label}<span className="hidden sm:inline"> (yd)</span></th>)}<th className="w-6" /></tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                <td className="px-1 py-1 text-slate-500">{i + 1}</td>
                {PARTS.map(({ part }) => (
                  <td key={part} className="px-1 py-1">
                    <input type="number" min="0" step="any" inputMode="decimal" style={{ paddingInline: 6 }} className={inputClass} value={row[part]} onChange={(e) => setCell(i, part, e.target.value)} />
                  </td>
                ))}
                <td className="px-1 py-1">
                  {block.rows.length > 1 && <button type="button" aria-label="Remove thaan" className="text-red-600" onClick={() => onChange({ ...block, rows: block.rows.filter((_, idx) => idx !== i) })}>×</button>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-300 font-medium">
            <tr>
              <td className="px-1 py-2"><span className="sm:hidden">Tot</span><span className="hidden sm:inline">Total</span></td>
              {parts.map((y, i) => <td key={i} className="px-1 py-2">{y} yd</td>)}
              <td />
            </tr>
            <tr className="text-xs font-normal text-slate-500">
              <td />
              <td colSpan="3" className="px-1">All parts: {yards} yd = {toMeters(yards).toFixed(2)} m</td>
              <td />
            </tr>
            <tr>
              <td className="px-1 py-1 text-xs font-normal text-slate-500">Rate</td>
              {PARTS.map(({ part, label }) => (
                <td key={part} className="px-1 py-1">
                  <input required={partYards(block.rows, part) > 0} type="number" min="0" step="any" inputMode="decimal" style={{ paddingInline: 6 }} aria-label={`${label} rate`}
                    className={inputClass} value={block.rates?.[part] ?? ''} onChange={(e) => setRate(part, e.target.value)} />
                </td>
              ))}
              <td />
            </tr>
            <tr className="text-xs font-normal text-slate-600">
              <td className="px-1 py-1"><span className="sm:hidden">Amt</span><span className="hidden sm:inline">Amount</span></td>
              {amounts.map((a, i) => <td key={i} className="px-1 py-1">{a.toFixed(2)}</td>)}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => onChange({ ...block, rows: [...block.rows, emptyRow()] })}>+ Add thaan</Button>
        <label className="flex items-center gap-2 text-sm">Rates are per
          <select className={`${inputClass} w-28`} value={block.unit} onChange={(e) => onChange({ ...block, unit: e.target.value })}>
            <option value="meter">Meter</option>
            <option value="yard">Yard</option>
          </select>
        </label>
      </div>
    </div>
  );
}