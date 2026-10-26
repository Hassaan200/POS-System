import { useCallback, useEffect, useRef, useState } from 'react';
import { api, newKey } from '../lib/api.js';
import { money, today } from '../lib/format.js';
import { Button, ErrorBox, Field, Modal, PageHeader, inputClass } from '../components/ui.jsx';
import LinesEditor, { emptyLine, linesTotal } from '../components/LinesEditor.jsx';

function SaleForm({ products, customers, onClose, onSaved }) {
  const key = useRef(newKey());
  const [date, setDate] = useState(today());
  const [customerId, setCustomerId] = useState('');
  const [newName, setNewName] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const createdId = useRef(null);
  const [lines, setLines] = useState([{ ...emptyLine }]);
  const [discount, setDiscount] = useState('0');
  const [received, setReceived] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const subtotal = linesTotal(lines);
  const total = subtotal - Number(discount || 0);
  const receivedNow = received === '' ? total : Number(received);
  const remaining = total - receivedNow;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (customerId === 'new' && !createdId.current) {
        const mobile = newMobile.trim();
        const existing = mobile ? customers.find((c) => c.mobile === mobile) : null;
        createdId.current = existing
          ? existing.id
          : (await api.post('/customers', { name: newName.trim(), mobile: mobile || null, opening_balance: 0 })).id;
      }
      await api.post('/sales', {
        sale_date: date,
        customer_id: customerId === 'new' ? createdId.current : customerId ? Number(customerId) : null,
        lines: lines.map((l) => ({ product_id: Number(l.product_id), quantity: Number(l.quantity), rate: Number(l.rate) })),
        discount: Number(discount || 0),
        received_amount: Math.round(receivedNow * 100) / 100,
        notes: notes || null,
      }, key.current);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="New Sale" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date"><input required type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Customer" hint={customerId ? '' : 'Walk-in sales must be paid in full'}>
            <select className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Walk-in customer</option>
              <option value="new">+ New customer (add name and number)</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.mobile ? ` (${c.mobile})` : ''}</option>)}
            </select>
          </Field>
        </div>
        {customerId === 'new' && (
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
            <Field label="New customer name">
              <input required className={inputClass} value={newName} onChange={(e) => { setNewName(e.target.value); createdId.current = null; }} />
            </Field>
            <Field label="Mobile number" hint="If this number already exists, that customer is used">
              <input className={inputClass} inputMode="tel" value={newMobile} onChange={(e) => { setNewMobile(e.target.value); createdId.current = null; }} />
            </Field>
          </div>
        )}
        <LinesEditor products={products} lines={lines} onChange={setLines} mode="sale" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Discount (optional)">
            <input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </Field>
          <Field label="Amount received now" hint="Leave empty if the full amount is received">
            <input
              type="number" min="0" step="0.01" inputMode="decimal" className={inputClass}
              placeholder={String(Math.round(total * 100) / 100)}
              value={received} onChange={(e) => setReceived(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">Subtotal<div className="text-lg font-semibold">{money(subtotal)}</div></div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">Total sale<div className="text-lg font-semibold">{money(total)}</div></div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">Customer balance<div className="text-lg font-semibold">{money(remaining)}</div></div>
        </div>
        <Field label="Note (optional)"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save sale'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (search.trim()) params.set('search', search.trim());
    try {
      const [list, productList, customerList] = await Promise.all([
        api.get(`/sales?${params}`),
        api.get('/products?active=true'),
        api.get('/customers'),
      ]);
      setSales(list);
      setProducts(productList);
      setCustomers(customerList.filter((c) => c.is_active));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, search]);

  useEffect(() => { load(); }, [load]);

  async function cancel(sale) {
    if (!window.confirm(`Cancel ${sale.ref}? Stock will be returned and its payment removed.`)) return;
    try {
      await api.post(`/sales/${sale.id}/cancel`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageHeader title="Sales Records"><Button onClick={() => setShowForm(true)}>New Sale</Button></PageHeader>
      <ErrorBox message={error} />

      <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="From"><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="col-span-2"><Field label="Search"><input className={inputClass} placeholder="Reference or customer" value={search} onChange={(e) => setSearch(e.target.value)} /></Field></div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Date / Ref</th><th className="px-3 py-2">Customer</th>
              <th className="hidden px-3 py-2 md:table-cell">Items</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="hidden px-3 py-2 text-right md:table-cell">Received</th>
              <th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="7" className="px-3 py-6 text-center text-slate-500">Loading...</td></tr>}
            {!loading && sales.length === 0 && <tr><td colSpan="7" className="px-3 py-6 text-center text-slate-500">No sales found</td></tr>}
            {sales.map((s) => (
              <tr key={s.id} className={`border-t border-slate-100 ${s.status === 'cancelled' ? 'text-slate-400 line-through' : ''}`}>
                <td className="px-3 py-2"><div>{s.sale_date}</div><div className="font-mono text-xs">{s.ref}</div></td>
                <td className="px-3 py-2">{s.customer_name || 'Walk-in'}</td>
                <td className="hidden px-3 py-2 md:table-cell">{s.items}</td>
                <td className="px-3 py-2 text-right">{money(s.total_amount)}</td>
                <td className="hidden px-3 py-2 text-right md:table-cell">{money(s.received_amount)}</td>
                <td className="px-3 py-2 text-right font-semibold">{money(s.remaining_amount)}</td>
                <td className="px-3 py-2 text-right">
                  {s.status === 'active' ? <button className="text-red-600 underline" onClick={() => cancel(s)}>Cancel</button> : 'Cancelled'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <SaleForm products={products} customers={customers} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
      )}
    </div>
  );
}