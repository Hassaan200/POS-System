import { useCallback, useEffect, useRef, useState } from 'react';
import { api, newKey } from '../lib/api.js';
import { money, today } from '../lib/format.js';
import { Button, ErrorBox, Field, Modal, PageHeader, inputClass } from '../components/ui.jsx';

function ClearingForm({ onClose, onSaved }) {
  const key = useRef(newKey());
  const [form, setForm] = useState({ payment_date: today(), amount: '', agent_name: '', description: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/clearing', {
        payment_date: form.payment_date, amount: Number(form.amount),
        agent_name: form.agent_name || null, description: form.description || null,
      }, key.current);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Clearing payment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={error} />
        <Field label="Date"><input required type="date" className={inputClass} value={form.payment_date} onChange={set('payment_date')} /></Field>
        <Field label="Amount paid (Rs)">
          <input required autoFocus type="number" min="0.01" step="0.01" inputMode="decimal" className={inputClass} value={form.amount} onChange={set('amount')} />
        </Field>
        <Field label="Clearing agent (optional)"><input className={inputClass} value={form.agent_name} onChange={set('agent_name')} /></Field>
        <Field label="Detail (optional)" hint="Which shipment: cotton, kardana, mixed...">
          <input className={inputClass} value={form.description} onChange={set('description')} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save payment'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Clearing({ onTab, tabClass }) {
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try {
      setRows(await api.get(`/clearing?${params}`));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  async function voidRow(row) {
    if (!window.confirm(`Void this clearing payment of ${money(row.amount)}?`)) return;
    try {
      await api.post(`/clearing/${row.id}/void`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const total = rows.filter((r) => r.status === 'active').reduce((sum, r) => sum + Number(r.amount), 0);
  const tab = (value, label) => <button onClick={() => onTab(value)} className={tabClass(value === 'clearing')}>{label}</button>;

  return (
    <div>
      <PageHeader title="Payments">{tab('customer', 'Received from customers')}{tab('supplier', 'Paid to suppliers')}{tab('clearing', 'Clearing')}</PageHeader>
      <ErrorBox message={error} />
      <p className="my-3 max-w-xl text-sm text-slate-600">
        Money paid to the port clearing agents. Kept separate from fabric stock cost and counted as a shop expense in profit.
      </p>
      <div className="my-4"><Button onClick={() => setAdding(true)}>Add clearing payment</Button></div>
      <div className="my-4 grid grid-cols-2 gap-3 sm:w-96">
        <Field label="From"><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="mb-4 border border-slate-200 bg-white p-4 sm:w-64">
        <div className="text-xs text-slate-500">Total paid to clearing (active)</div>
        <div className="text-xl font-semibold">Rs {money(total)}</div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th><th className="px-3 py-2">Agent</th>
              <th className="hidden px-3 py-2 md:table-cell">Detail</th>
              <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5" className="px-3 py-6 text-center text-slate-500">Loading...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan="5" className="px-3 py-6 text-center text-slate-500">No clearing payments yet</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-slate-100 ${r.status === 'void' ? 'text-slate-400 line-through' : ''}`}>
                <td className="whitespace-nowrap px-3 py-2">{r.payment_date}</td>
                <td className="px-3 py-2">{r.agent_name || '-'}</td>
                <td className="hidden px-3 py-2 md:table-cell">{r.description || ''}</td>
                <td className="px-3 py-2 text-right font-medium">Rs {money(r.amount)}</td>
                <td className="px-3 py-2 text-right">
                  {r.status === 'active' ? <button className="text-red-600 underline" onClick={() => voidRow(r)}>Void</button> : 'Voided'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding && <ClearingForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}