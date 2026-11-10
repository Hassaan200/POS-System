import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { cur } from '../lib/format.js';
import useRate from '../lib/useRate.js';
import Amount from '../components/Amount.jsx';
import { Button, ErrorBox, Field, Modal, PageHeader, inputClass } from '../components/ui.jsx';
import { PaymentForm, config } from './Parties.jsx';
import Clearing from './Clearing.jsx';

function PartyPicker({ kind, onPick, onClose }) {
  const [parties, setParties] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(config[kind].base)
      .then((list) => setParties(list.filter((p) => p.is_active && (p.balance > 0 || p.currency === 'CNY'))))
      .catch((err) => setError(err.message));
  }, [kind]);

  return (
    <Modal title={config[kind].payLabel} onClose={onClose}>
      <ErrorBox message={error} />
      {!parties && !error && <div className="text-sm text-slate-500">Loading...</div>}
      {parties && parties.length === 0 && <div className="text-sm text-slate-500">No party available.</div>}
      {parties && parties.length > 0 && (
        <Field label={kind === 'customer' ? 'Customer' : 'Supplier'}>
          <select className={inputClass} defaultValue="" onChange={(e) => onPick(parties.find((p) => String(p.id) === e.target.value))}>
            <option value="">Select...</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name} - {cur(p.balance, p.currency || 'PKR')}</option>)}
          </select>
        </Field>
      )}
    </Modal>
  );
}

const tabClass = (on) => `rounded-lg px-4 py-2 text-sm ${on ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white'}`;

export default function Payments() {
  const [kind, setKind] = useState('customer');
  if (kind === 'clearing') return <Clearing onTab={setKind} tabClass={tabClass} />;
  return <PartyPayments kind={kind} setKind={setKind} />;
}

function PartyPayments({ kind, setKind }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState(null);
  const rate = useRate();

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    setLoading(true);
    try {
      setRows(await api.get(`/payments/${kind}?${params}`));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [kind, from, to]);

  useEffect(() => { load(); }, [load]);

  async function voidPayment(row) {
    if (!window.confirm(`Void this payment of ${cur(row.amount, row.currency || 'PKR')}? The balance will go back up.`)) return;
    try {
      await api.post(`/payments/${kind}/${row.id}/void`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const isCustomer = kind === 'customer';
  const active = rows.filter((r) => r.status === 'active');
  const total = active.reduce((sum, r) => sum + r.amount, 0);
  const totalCode = !isCustomer && active.length && active.every((r) => r.currency === 'CNY') ? 'CNY' : 'PKR';
  const tab = (value, label) => (
    <button onClick={() => setKind(value)} className={tabClass(kind === value)}>{label}</button>
  );

  return (
    <div>
      <PageHeader title="Payments">{tab('customer', 'Received from customers')}{tab('supplier', 'Paid to suppliers')}{tab('clearing', 'Clearing')}</PageHeader>
      <ErrorBox message={error} />

      <div className="my-4">
        <Button onClick={() => setPicking(true)}>{isCustomer ? 'Receive payment from customer' : 'Pay a supplier'}</Button>
      </div>

      <div className="my-4 grid grid-cols-2 gap-3 sm:w-96">
        <Field label="From"><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 sm:w-64">
        <div className="text-xs text-slate-500">Total {isCustomer ? 'received' : 'paid'} (active)</div>
        <div className="text-xl font-semibold"><Amount value={total} currency={totalCode} rate={rate} /></div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">{isCustomer ? 'Customer' : 'Supplier'}</th>
              <th className="hidden px-3 py-2 md:table-cell">Reference</th>
              <th className="hidden px-3 py-2 md:table-cell">Note</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="6" className="px-3 py-6 text-center text-slate-500">Loading...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan="6" className="px-3 py-6 text-center text-slate-500">No payments found</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-slate-100 ${r.status === 'void' ? 'text-slate-400 line-through' : ''}`}>
                <td className="px-3 py-2">{r.payment_date}</td>
                <td className="px-3 py-2">{(isCustomer ? r.customer_name : r.supplier_name) || 'Walk-in'}</td>
                <td className="hidden px-3 py-2 md:table-cell">{(isCustomer ? r.sale_ref : r.purchase_ref) || '-'}</td>
                <td className="hidden px-3 py-2 md:table-cell">{r.notes || ''}</td>
                <td className="px-3 py-2 text-right font-medium"><Amount value={r.amount} currency={r.currency || 'PKR'} rate={Number(r.exchange_rate) > 1 ? Number(r.exchange_rate) : rate} /></td>
                <td className="px-3 py-2 text-right">
                  {r.status === 'active' ? <button className="text-red-600 underline" onClick={() => voidPayment(r)}>Void</button> : 'Voided'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {picking && (
        <PartyPicker kind={kind} onClose={() => setPicking(false)} onPick={(party) => { setPicking(false); setChosen(party); }} />
      )}
      {chosen && (
        <PaymentForm cfg={config[kind]} party={chosen} onClose={() => setChosen(null)} onSaved={() => { setChosen(null); load(); }} />
      )}
    </div>
  );
}