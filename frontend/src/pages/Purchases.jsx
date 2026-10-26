import { useCallback, useEffect, useRef, useState } from 'react';
import { api, newKey } from '../lib/api.js';
import { money, today } from '../lib/format.js';
import { Button, ErrorBox, Field, Modal, PageHeader, inputClass } from '../components/ui.jsx';
import LinesEditor, { emptyLine, linesTotal } from '../components/LinesEditor.jsx';

function PurchaseForm({ products, suppliers, onClose, onSaved }) {
  const key = useRef(newKey());
  const [date, setDate] = useState(today());
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState([{ ...emptyLine }]);
  const [paid, setPaid] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const total = linesTotal(lines);
  const remaining = total - Number(paid || 0);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/purchases', {
        purchase_date: date,
        supplier_id: Number(supplierId),
        lines: lines.map((l) => ({ product_id: Number(l.product_id), quantity: Number(l.quantity), rate: Number(l.rate) })),
        paid_amount: Number(paid || 0),
        notes: notes || null,
      }, key.current);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="New Purchase" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date"><input required type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Supplier">
            <select required className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
        <LinesEditor products={products} lines={lines} onChange={setLines} mode="purchase" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Amount paid now">
            <input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={paid} onChange={(e) => setPaid(e.target.value)} />
          </Field>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">Total<div className="text-lg font-semibold">{money(total)}</div></div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">Remaining payable<div className="text-lg font-semibold">{money(remaining)}</div></div>
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

export default function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try {
      const [list, productList, supplierList] = await Promise.all([
        api.get(`/purchases?${params}`),
        api.get('/products?active=true'),
        api.get('/suppliers'),
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
    try {
      await api.post(`/purchases/${purchase.id}/cancel`);
      load();
    } catch (err) {
      setError(err.message);
    }
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
                <td className="px-3 py-2 text-right">{money(p.total_amount)}</td>
                <td className="hidden px-3 py-2 text-right md:table-cell">{money(p.paid_amount)}</td>
                <td className="px-3 py-2 text-right font-semibold">{money(p.remaining_amount)}</td>
                <td className="px-3 py-2 text-right">
                  {p.status === 'active' ? <button className="text-red-600 underline" onClick={() => cancel(p)}>Cancel</button> : 'Cancelled'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <PurchaseForm products={products} suppliers={suppliers} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
      )}
    </div>
  );
}