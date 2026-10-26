import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, newKey } from '../lib/api.js';
import { money, qty, today } from '../lib/format.js';
import { Button, ErrorBox, Field, Modal, PageHeader, inputClass } from '../components/ui.jsx';

const config = {
  customer: {
    base: '/customers', title: 'Customers', add: 'Add Customer', totalKey: 'total_charged', paidKey: 'total_received',
    totalLabel: 'Total charged', paidLabel: 'Received', balanceLabel: 'Receivable', payLabel: 'Receive payment',
    payPath: '/payments/customer', idField: 'customer_id', debitLabel: 'Charged', creditLabel: 'Received',
  },
  supplier: {
    base: '/suppliers', title: 'Suppliers', add: 'Add Supplier', totalKey: 'total_purchases', paidKey: 'total_paid',
    totalLabel: 'Total purchases', paidLabel: 'Paid', balanceLabel: 'Payable', payLabel: 'Pay supplier',
    payPath: '/payments/supplier', idField: 'supplier_id', debitLabel: 'Purchased', creditLabel: 'Paid',
  },
};

function PartyForm({ cfg, party, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: party?.name || '',
    mobile: party?.mobile || '',
    opening_balance: String(party?.opening_balance ?? 0),
    is_active: party ? Boolean(party.is_active) : true,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = { name: form.name, mobile: form.mobile || null, opening_balance: Number(form.opening_balance) };
    try {
      if (party) await api.put(`${cfg.base}/${party.id}`, { ...payload, is_active: form.is_active });
      else await api.post(cfg.base, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={party ? `Edit ${party.name}` : cfg.add} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={error} />
        <Field label="Name"><input required className={inputClass} value={form.name} onChange={set('name')} /></Field>
        <Field label="Mobile number"><input className={inputClass} value={form.mobile} onChange={set('mobile')} /></Field>
        <Field label="Opening balance" hint="Amount already pending before you started using this system">
          <input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={form.opening_balance} onChange={set('opening_balance')} />
        </Field>
        {party && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Active
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentForm({ cfg, party, onClose, onSaved }) {
  const key = useRef(newKey());
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(cfg.payPath, { [cfg.idField]: party.id, payment_date: date, amount: Number(amount), notes: notes || null }, key.current);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`${cfg.payLabel} - ${party.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={error} />
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          Outstanding: <span className="font-semibold">{money(party.balance)}</span>
        </div>
        <Field label="Amount">
          <input required autoFocus type="number" min="0.01" step="0.01" inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date"><input required type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Note (optional)"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save payment'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function Statement({ cfg, party, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`${cfg.base}/${party.id}/statement`).then(setData).catch((err) => setError(err.message));
  }, [cfg.base, party.id]);

  return (
    <Modal title={`Statement - ${party.name}`} onClose={onClose} wide>
      <ErrorBox message={error} />
      {!data && !error && <div className="text-sm text-slate-500">Loading...</div>}
      {data && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Date</th><th className="px-2 py-2">Ref</th><th className="px-2 py-2">Details</th>
                <th className="px-2 py-2 text-right">{cfg.debitLabel}</th><th className="px-2 py-2 text-right">{cfg.creditLabel}</th>
                <th className="px-2 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100 text-slate-500">
                <td className="px-2 py-2" colSpan="5">Opening balance</td>
                <td className="px-2 py-2 text-right">{money(data.opening_balance)}</td>
              </tr>
              {data.rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-2 py-2">{r.date}</td>
                  <td className="px-2 py-2">{r.reference}</td>
                  <td className="px-2 py-2">{r.description}</td>
                  <td className="px-2 py-2 text-right">{r.debit ? money(r.debit) : ''}</td>
                  <td className="px-2 py-2 text-right">{r.credit ? money(r.credit) : ''}</td>
                  <td className="px-2 py-2 text-right font-medium">{money(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 text-right text-sm font-semibold">Outstanding: {money(data.customer?.balance ?? data.supplier?.balance)}</div>
        </div>
      )}
    </Modal>
  );
}

function PartyPage({ kind }) {
  const cfg = config[kind];
  const [parties, setParties] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);

  const load = useCallback(async () => {
    try {
      setParties(await api.get(cfg.base));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cfg.base]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return parties.filter((p) => !term || p.name.toLowerCase().includes(term) || (p.mobile || '').includes(term));
  }, [parties, search]);

  const outstanding = visible.reduce((sum, p) => sum + p.balance, 0);
  const done = () => { setDialog(null); load(); };

  return (
    <div>
      <PageHeader title={cfg.title}>
        <Button onClick={() => setDialog({ type: 'form' })}>{cfg.add}</Button>
      </PageHeader>
      <ErrorBox message={error} />

      <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input className={`${inputClass} sm:col-span-2`} placeholder="Search by name or mobile" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
          <div className="text-xs text-slate-500">Total {cfg.balanceLabel.toLowerCase()}</div>
          <div className="font-semibold">{money(outstanding)}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="hidden px-3 py-2 md:table-cell">{cfg.totalLabel}</th>
              <th className="hidden px-3 py-2 md:table-cell">{cfg.paidLabel}</th>
              <th className="px-3 py-2">{cfg.balanceLabel}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5" className="px-3 py-6 text-center text-slate-500">Loading...</td></tr>}
            {!loading && visible.length === 0 && <tr><td colSpan="5" className="px-3 py-6 text-center text-slate-500">Nothing found</td></tr>}
            {visible.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium">{p.name}{!p.is_active && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}</div>
                  <div className="text-xs text-slate-500">{p.mobile || 'No mobile'}</div>
                </td>
                <td className="hidden px-3 py-2 md:table-cell">{money(p[cfg.totalKey])}</td>
                <td className="hidden px-3 py-2 md:table-cell">{money(p[cfg.paidKey])}</td>
                <td className={`px-3 py-2 font-semibold ${p.balance > 0 ? 'text-amber-700' : ''}`}>{money(p.balance)}</td>
                <td className="space-x-3 whitespace-nowrap px-3 py-2 text-right">
                  <button className="underline" onClick={() => setDialog({ type: 'statement', party: p })}>Statement</button>
                  {p.balance > 0 && <button className="underline" onClick={() => setDialog({ type: 'pay', party: p })}>Pay</button>}
                  <button className="underline" onClick={() => setDialog({ type: 'form', party: p })}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog?.type === 'form' && <PartyForm cfg={cfg} party={dialog.party} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.type === 'pay' && <PaymentForm cfg={cfg} party={dialog.party} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.type === 'statement' && <Statement cfg={cfg} party={dialog.party} onClose={() => setDialog(null)} />}
    </div>
  );
}

export const Customers = () => <PartyPage kind="customer" />;
export const Suppliers = () => <PartyPage kind="supplier" />;