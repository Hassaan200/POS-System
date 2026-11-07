import { Button, inputClass } from './ui.jsx';
import { money, qty, lineAmount } from '../lib/format.js';

export const emptyLine = { product_id: '', quantity: '', rate: '', unit: 'yard' };

export const lineTotal = (line) => lineAmount(line.quantity, line.rate, line.unit || 'yard');
export const linesTotal = (lines) => lines.reduce((sum, line) => sum + lineTotal(line), 0);

export default function LinesEditor({ products, lines, onChange, mode }) {
  const update = (index, patch) => onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const pick = (index, id) => {
    const product = products.find((p) => String(p.id) === id);
    const rate = product && mode !== 'sale' ? product.purchase_cost : '';
    update(index, { product_id: id, rate: String(rate) });
  };

  const setNames = [...new Set(products.filter((p) => p.set_name).map((p) => p.set_name))];
  const addSet = (name) => {
    if (!name) return;
    const parts = ['front', 'back', 'dupatta']
      .map((part) => products.find((p) => p.set_name === name && p.part === part))
      .filter(Boolean)
      .map((p) => ({ ...emptyLine, product_id: String(p.id), fromSet: true }));
    const kept = lines.length === 1 && !lines[0].product_id ? [] : lines;
    onChange([...kept, ...parts]);
  };

  return (
    <div className="space-y-3">
      {mode === 'sale' && setNames.length > 0 && (
        <select className={inputClass} value="" onChange={(e) => addSet(e.target.value)}>
          <option value="">+ Add a whole set (Front / Back / Dupatta)...</option>
          {setNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      )}
      {lines.map((line, index) => {
        const product = products.find((p) => String(p.id) === line.product_id);
        return (
          <div key={index} className="rounded-lg border border-slate-200 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
              <div className="sm:col-span-3">
                <select required className={inputClass} value={line.product_id} onChange={(e) => pick(index, e.target.value)}>
                  <option value="">Select fabric</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                </select>
                {mode === 'sale' && product && (
                  <div className="mt-1 text-xs text-slate-500">Available: {qty(product.stock_qty)} yards</div>
                )}
              </div>
              <input
                required={!line.fromSet} type="number" min="0.01" step="any" inputMode="decimal" placeholder="Yards"
                className={inputClass} value={line.quantity} onChange={(e) => update(index, { quantity: e.target.value })}
              />
              <select aria-label="Rate per" className={inputClass} value={line.unit || 'yard'} onChange={(e) => update(index, { unit: e.target.value })}>
                <option value="yard">Rate/yd</option>
                <option value="meter">Rate/m</option>
              </select>
              <input
                required={!line.fromSet || Number(line.quantity) > 0} type="number" min="0" step="0.01" inputMode="decimal" placeholder="Rate"
                className={inputClass} value={line.rate} onChange={(e) => update(index, { rate: e.target.value })}
              />
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{money(lineTotal(line))}</span>
                {lines.length > 1 && (
                  <button type="button" className="text-red-600" onClick={() => onChange(lines.filter((_, i) => i !== index))}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <Button variant="secondary" onClick={() => onChange([...lines, { ...emptyLine }])}>+ Add another fabric</Button>
    </div>
  );
}