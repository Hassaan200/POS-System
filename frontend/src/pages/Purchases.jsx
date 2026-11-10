import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, newKey } from '../lib/api.js';
import { cur, lineAmount, qty, today, toMeters } from '../lib/format.js';
import useRate from '../lib/useRate.js';
import { Button, ErrorBox, Field, Modal, PageHeader, inputClass } from '../components/ui.jsx';
import Amount from '../components/Amount.jsx';
import { PARTS, ThaanGrid, emptyRow, setTotals } from '../components/ThaanGrid.jsx';

const emptySet = () => ({ kind: 'set', set_name: '', rows: [emptyRow()], rate: '', unit: 'meter' });
const emptyPlain = () => ({ kind: 'plain', product_id: '', rows: [{ v: '' }], rate: '', unit: 'meter' });

const UnitRate = ({ block, onChange, code }) => (
  <div className="grid grid-cols-2 gap-2">
    <Field label={`Rate (${code === 'CNY' ? '¥' : 'Rs'})`}>
      <input required type="number" min="0" step="any" inputMode="decimal" className={inputClass} value={block.rate} onChange={(e) => onChange({ ...block, rate: e.target.value })} />
    </Field>
    <Field label="Per">
      <select className={inputClass} value={block.unit} onChange={(e) => onChange({ ...block, unit: e.target.value })}>
        <option value="meter">Meter</option>
        <option value="yard">Yard</option>
      </select>
    </Field>
  </div>
);

function PlainBlock({ block, products, onChange, code }) {
  const yards = Math.round(block.rows.reduce((s, r) => s + Number(r.v || 0), 0) * 100) / 100;
  return (
    <div className="space-y-2">
      <select required className={inputClass} value={block.product_id} onChange={(e) => onChange({ ...block, product_id: e.target.value })}>
        <option value="">Select fabric</option>
        {products.filter((p) => !p.set_name).map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
      </select>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {block.rows.map((r, i) => (
          <input key={i} type="number" min="0" step="any" inputMode="decimal" placeholder={`Thaan ${i + 1} yd`} className={inputClass} value={r.v}
            onChange={(e) => onChange({ ...block, rows: block.rows.map((x, j) => (j === i ? { v: e.target.value } : x)) })} />
        ))}
      </div>
      <Button variant="secondary" onClick={() => onChange({ ...block, rows: [...block.rows, { v: '' }] })}>+ Thaan</Button>
      <div className="text-xs text-slate-500">{yards} yd = {toMeters(yards).toFixed(2)} m</div>
      <UnitRate block={block} onChange={onChange} code={code} />
    </div>
  );
}

const blockAmount = (b) => (b.kind === 'set'
  ? setTotals(b).amount
  : lineAmount(b.rows.reduce((s, r) => s + Number(r.v || 0), 0), b.rate, b.unit));

function PurchaseForm({ products, suppliers, onClose, onSaved }) {
  const key = useRef(newKey());
  const defaultRate = useRate();
  const [date, setDate] = useState(today());
  const [supplierId, setSupplierId] = useState('');
  const [blocks, setBlocks] = useState([emptySet()]);
  const [rateInput, setRateInput] = useState('');
  const [paid, setPaid] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const supplier = suppliers.find((s) => String(s.id) === supplierId);
  const code = supplier?.currency || 'PKR';
  const isCny = code === 'CNY';
  const rate = isCny ? Number(rateInput || defaultRate || 0) : 1;
  const setNames = useMemo(() => [...new Set(products.filter((p) => p.set_name).map((p) => p.set_name))], [products]);

  const total = Math.round(blocks.reduce((s, b) => s + blockAmount(b), 0) * 100) / 100;
  const update = (i) => (next) => setBlocks((bs) => bs.map((b, idx) => (idx === i ? next : b)));

  function buildLines() {
    const lines = [];
    for (const b of blocks) {
      if (b.kind === 'set') {
        if (!b.set_name) throw new Error('Select a set for every set block');
        for (const { part } of PARTS) {
          const pieces = b.rows.map((r) => Number(r[part])).filter((n) => n > 0);
          if (!pieces.length) continue;
          const product = products.find((p) => p.set_name === b.set_name && p.part === part);
          if (!product) throw new Error(`${b.set_name} has no ${part} product`);
          lines.push({ product_id: product.id, pieces, rate: Number(b.rate), rate_unit: b.unit });
        }
      } else {
        if (!b.product_id) throw new Error('Select a fabric for every plain block');
        const pieces = b.rows.map((r) => Number(r.v)).filter((n) => n > 0);
        if (pieces.length) lines.push({ product_id: Number(b.product_id), pieces, rate: Number(b.rate), rate_unit: b.unit });
      }
    }
    if (!lines.length) throw new Error('Enter at least one thaan length');
    return lines;
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    let lines;
    try { lines = buildLines(); } catch (err) { setError(err.message); return; }
    if (isCny && !(rate > 0)) { setError('Enter the Yuan rate (PKR for 1 ¥)'); return; }
    setBusy(true);
    try {
      const body = { purchase_date: date, supplier_id: Number(supplierId), lines, paid_amount: Number(paid || 0), notes: notes || null };
      if (isCny) body.exchange_rate = rate;
      await api.post('/purchases', body, key.current);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="New Purchase" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Date"><input required type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Supplier">
            <select required className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.currency === 'CNY' ? '¥' : 'PKR'})</option>)}
            </select>
          </Field>
          {isCny && (
            <Field label="Rate today (PKR for 1 ¥)">
              <input type="number" min="0" step="0.0001" inputMode="decimal" className={inputClass} placeholder={String(defaultRate || '')} value={rateInput} onChange={(e) => setRateInput(e.target.value)} />
            </Field>
          )}
        </div>

        {blocks.map((b, i) => (
          <div key={i} className="space-y-3 border border-slate-300 p-3">
            <div className="flex items-center justify-between gap-2">
              {b.kind === 'set' ? (
                <select required className={`${inputClass} sm:w-72`} value={b.set_name} onChange={(e) => update(i)({ ...b, set_name: e.target.value })}>
                  <option value="">Select set (e.g. D-1)</option>
                  {setNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              ) : <span className="text-sm font-medium">Plain fabric</span>}
              <div className="text-sm font-semibold">{cur(blockAmount(b), code)}</div>
              {blocks.length > 1 && <button type="button" className="text-red-600" onClick={() => setBlocks(blocks.filter((_, idx) => idx !== i))}>Remove</button>}
            </div>
            {b.kind === 'set'
              ? <><ThaanGrid block={b} onChange={update(i)} /><UnitRate block={b} onChange={update(i)} code={code} /></>
              : <PlainBlock block={b} products={products} onChange={update(i)} code={code} />}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setBlocks([...blocks, emptySet()])}>+ Add set</Button>
          <Button variant="secondary" onClick={() => setBlocks([...blocks, emptyPlain()])}>+ Add plain fabric</Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={`Paid now (${isCny ? '¥' : 'Rs'})`}>
            <input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={paid} onChange={(e) => setPaid(e.target.value)} />
          </Field>
          <div className="bg-slate-50 px-3 py-2 text-sm">Bill total<div className="text-lg font-semibold"><Amount value={total} currency={code} rate={rate} /></div></div>
          <div className="bg-slate-50 px-3 py-2 text-sm">Remaining<div className="text-lg font-semibold"><Amount value={total - Number(paid || 0)} currency={code} rate={rate} /></div></div>
        </div>
        <Field label="Note (optional)"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save purchase'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function CostForm({ purchase, onSaved }) {
  const key = useRef(newKey());
  const [form, setForm] = useState({ kind: 'shipping', amount: '', description: '' });
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/purchases/${purchase.id}/costs`, { cost_date: today(), kind: form.kind, amount: Number(form.amount), description: form.description || null }, key.current);
      key.current = newKey();
      setForm({ kind: 'shipping', amount: '', description: '' });
      onSaved();
    } catch (err) { setError(err.message); }
  }
  return (
    <form onSubmit={submit} className="space-y-2 border border-dashed border-slate-300 p-3">
      <div className="text-sm font-medium">Add shipping / tax (Rs)</div>
      <div className="grid grid-cols-3 gap-2">
        <select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          <option value="shipping">Shipping</option><option value="customs">Tax / customs</option><option value="other">Other</option>
        </select>
        <input required type="number" min="0.01" step="0.01" placeholder="Amount Rs" className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <input placeholder="Note" className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <ErrorBox message={error} />
      <Button type="submit">Add cost</Button>
    </form>
  );
}

function BillView({ id, onClose, onChanged }) {
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.get(`/purchases/${id}`).then(setP).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  async function voidCost(c) {
    if (!window.confirm('Void this cost? Stock value will go back down.')) return;
    try { await api.post(`/purchases/costs/${c.id}/void`); await load(); onChanged(); } catch (e) { setError(e.message); }
  }

  const groups = useMemo(() => {
    if (!p) return [];
    const map = new Map();
    for (const l of p.lines) {
      const k = l.set_name || `plain-${l.id}`;
      if (!map.has(k)) map.set(k, { name: l.set_name || l.product_name, set: Boolean(l.set_name), lines: [] });
      map.get(k).lines.push(l);
    }
    return [...map.values()];
  }, [p]);

  const code = p?.currency || 'PKR';
  const totalYards = p ? p.lines.reduce((s, l) => s + Number(l.quantity), 0) : 0;

  return (
    <Modal title={p ? `${p.ref} - ${p.supplier_name}` : 'Bill'} onClose={onClose} wide>
      <ErrorBox message={error} />
      {!p && !error && <div className="text-sm text-slate-500">Loading...</div>}
      {p && (
        <div className="space-y-4">
          <div className="text-sm text-slate-600">{p.purchase_date}{code === 'CNY' && ` · rate ${p.exchange_rate} PKR per ¥`}</div>
          {groups.map((g) => {
            const byPart = Object.fromEntries(g.lines.map((l) => [l.part || 'plain', l]));
            const cols = g.set ? PARTS.filter((c) => byPart[c.part]) : [{ part: 'plain', label: 'Yards' }];
            const rows = Math.max(...cols.map((c) => byPart[c.part].pieces.length), 0);
            return (
              <div key={g.name} className="overflow-x-auto border border-slate-300 p-2">
                <div className="mb-1 font-medium">{g.name}</div>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-slate-500">
                    <tr><th className="px-1 py-1">#</th>{cols.map((c) => <th key={c.part} className="px-1 py-1">{c.label} (yd)</th>)}</tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: rows }, (_, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-1 py-1 text-slate-500">{i + 1}</td>
                        {cols.map((c) => <td key={c.part} className="px-1 py-1">{byPart[c.part].pieces[i] ?? ''}</td>)}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-300 font-medium">
                    <tr><td className="px-1 py-1">Total yd</td>{cols.map((c) => <td key={c.part} className="px-1 py-1">{qty(byPart[c.part].quantity)}</td>)}</tr>
                    <tr className="text-xs font-normal text-slate-600"><td className="px-1 py-1">Meters</td>{cols.map((c) => <td key={c.part} className="px-1 py-1">{toMeters(byPart[c.part].quantity).toFixed(2)}</td>)}</tr>
                    <tr className="text-xs font-normal text-slate-600"><td className="px-1 py-1">{cur(g.lines[0].rate, code)}/{g.lines[0].rate_unit}</td>{cols.map((c) => <td key={c.part} className="px-1 py-1">{cur(byPart[c.part].line_total, code)}</td>)}</tr>
                  </tfoot>
                </table>
              </div>
            );
          })}
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="bg-slate-50 px-3 py-2">Total<div className="font-semibold">{qty(totalYards)} yd</div><div className="text-xs text-slate-500">{toMeters(totalYards).toFixed(2)} m</div></div>
            <div className="bg-slate-50 px-3 py-2">Bill<div className="font-semibold"><Amount value={p.total_amount} currency={code} rate={Number(p.exchange_rate)} /></div></div>
            <div className="bg-slate-50 px-3 py-2">Paid<div className="font-semibold">{cur(p.paid_amount, code)}</div></div>
            <div className="bg-slate-50 px-3 py-2">Stock cost (PKR)<div className="font-semibold">{cur(p.landed_cost_pkr, 'PKR')}</div></div>
          </div>
          {p.extra_costs.length > 0 && (
            <div className="text-sm">
              {p.extra_costs.map((c) => (
                <div key={c.id} className={`flex justify-between border-t border-slate-100 py-1 ${c.status === 'void' ? 'text-slate-400 line-through' : ''}`}>
                  <span>{c.kind} {c.description || ''}</span>
                  <span>{cur(c.amount, 'PKR')} {c.status === 'active' && <button className="ml-2 text-red-600 underline" onClick={() => voidCost(c)}>Void</button>}</span>
                </div>
              ))}
            </div>
          )}
          {p.status === 'active' && <CostForm purchase={p} onSaved={() => { load(); onChanged(); }} />}
        </div>
      )}
    </Modal>
  );
}

export default function Purchases() {
  const rate = useRate();
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [viewId, setViewId] = useState(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try {
      const [list, productList, supplierList] = await Promise.all([
        api.get(`/purchases?${params}`), api.get('/products?active=true'), api.get('/suppliers'),
      ]);
      setPurchases(list);
      setProducts(productList);
      setSuppliers(supplierList.filter((s) => s.is_active));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  async function cancel(purchase) {
    if (!window.confirm(`Cancel ${purchase.ref}? Its stock and payments will be reversed.`)) return;
    try { await api.post(`/purchases/${purchase.id}/cancel`); load(); } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <PageHeader title="Purchases"><Button onClick={() => setShowForm(true)}>New Purchase</Button></PageHeader>
      <ErrorBox message={error} />
      <div className="my-4 grid grid-cols-2 gap-3 sm:w-96">
        <Field label="From"><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Date / Ref</th><th className="px-3 py-2">Supplier</th>
              <th className="hidden px-3 py-2 md:table-cell">Items</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="hidden px-3 py-2 text-right md:table-cell">Paid</th>
              <th className="px-3 py-2 text-right">Remaining</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="7" className="px-3 py-6 text-center text-slate-500">Loading...</td></tr>}
            {!loading && purchases.length === 0 && <tr><td colSpan="7" className="px-3 py-6 text-center text-slate-500">No purchases found</td></tr>}
            {purchases.map((p) => (
              <tr key={p.id} className={`border-t border-slate-100 ${p.status === 'cancelled' ? 'text-slate-400 line-through' : ''}`}>
                <td className="px-3 py-2"><div>{p.purchase_date}</div><div className="font-mono text-xs">{p.ref}</div></td>
                <td className="px-3 py-2">{p.supplier_name}</td>
                <td className="hidden px-3 py-2 md:table-cell">{p.items}</td>
                <td className="px-3 py-2 text-right"><Amount value={p.total_amount} currency={p.currency} rate={Number(p.exchange_rate) > 1 ? Number(p.exchange_rate) : rate} /></td>
                <td className="hidden px-3 py-2 text-right md:table-cell">{cur(p.paid_amount, p.currency)}</td>
                <td className="px-3 py-2 text-right font-semibold">{cur(p.remaining_amount, p.currency)}</td>
                <td className="space-x-3 whitespace-nowrap px-3 py-2 text-right">
                  <button className="underline" onClick={() => setViewId(p.id)}>Bill</button>
                  {p.status === 'active' ? <button className="text-red-600 underline" onClick={() => cancel(p)}>Cancel</button> : 'Cancelled'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm && <PurchaseForm products={products} suppliers={suppliers} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {viewId && <BillView id={viewId} onClose={() => setViewId(null)} onChanged={load} />}
    </div>
  );
}