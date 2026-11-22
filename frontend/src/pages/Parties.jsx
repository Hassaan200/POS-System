import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, newKey } from '../lib/api.js';
import { PhotoStrip } from '../components/Photos.jsx';
import { cur, qty, toMeters, today } from '../lib/format.js';
import useRate from '../lib/useRate.js';
import Amount from '../components/Amount.jsx';
import { Button, ErrorBox, Field, Modal, PageHeader, inputClass } from '../components/ui.jsx';

export const config = {
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
    currency: party?.currency || 'CNY',
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
    if (cfg.idField === 'supplier_id') payload.currency = form.currency;
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
        {cfg.idField === 'supplier_id' && (
          <Field label="Supplier currency" hint={party ? 'Can be changed only until the first purchase or payment is entered' : 'China suppliers: Yuan'}>
            <select className={inputClass} value={form.currency} onChange={set('currency')}>
              <option value="CNY">Yuan (¥)</option>
              <option value="PKR">Rupees (PKR)</option>
            </select>
          </Field>
        )}
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

export function PaymentForm({ cfg, party, onClose, onSaved }) {
  const key = useRef(newKey());
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const defaultRate = useRate();
  const [rateInput, setRateInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const code = party.currency || 'PKR';
  const isCny = code === 'CNY';
  const rate = Number(rateInput || defaultRate || 0);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { [cfg.idField]: party.id, payment_date: date, amount: Number(amount), notes: notes || null };
      if (isCny) body.exchange_rate = rate;
      await api.post(cfg.payPath, body, key.current);
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
          {party.balance < 0 ? 'Advance paid:' : 'Outstanding:'} <span className="font-semibold"><Amount value={Math.abs(party.balance)} currency={code} rate={defaultRate} /></span>
        </div>
        <Field label={`Amount${isCny ? ' (¥)' : ''}`} hint={cfg.idField === 'supplier_id' ? 'You may pay more than the balance; it is kept as advance.' : undefined}>
          <input required autoFocus type="number" min="0.01" step="0.01" inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {isCny && (
          <Field label="Rate today (PKR for 1 ¥)" hint={amount && rate ? `≈ ${cur(Number(amount) * rate, 'PKR')}` : undefined}>
            <input type="number" min="0" step="0.0001" inputMode="decimal" className={inputClass} placeholder={String(defaultRate || '')} value={rateInput} onChange={(e) => setRateInput(e.target.value)} />
          </Field>
        )}
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

function ItemsTable({ lines, code, showMeters }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-1.5 py-1 sm:px-2">Fabric</th>
            <th className="px-2 py-1 text-right">Yards</th>
            {showMeters && <th className="px-2 py-1 text-right">Meters</th>}
            <th className="px-2 py-1 text-right">Rate</th>
            <th className="px-2 py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-1.5 py-1.5 sm:px-2">{l.name}{l.design_name && <div className="text-xs text-slate-500">{l.design_name}</div>}</td>
              <td className="px-2 py-1.5 text-right">{qty(l.quantity)}</td>
              {showMeters && <td className="px-2 py-1.5 text-right">{toMeters(l.quantity).toFixed(2)}</td>}
              <td className="px-1.5 py-1.5 text-right sm:px-2 sm:whitespace-nowrap">{cur(l.rate, code)}/{l.rate_unit === 'meter' ? 'm' : 'yd'}</td>
              <td className="px-1.5 py-1.5 text-right font-medium sm:px-2">{cur(l.line_total, code)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Statement({ cfg, party, onClose }) {
  const code = party.currency || 'PKR';
  const fmt = (v) => cur(v, code);
  const isSupplier = cfg.idField === 'supplier_id';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`${cfg.base}/${party.id}/statement`).then(setData).catch((err) => setError(err.message));
  }, [cfg.base, party.id]);

  const designSummary = useMemo(() => {
    if (!data || !isSupplier) return [];
    const map = new Map();
    for (const r of data.rows) {
      for (const l of r.lines ?? []) {
        if (!l.design_name) continue;
        const e = map.get(l.design_name) ?? { design: l.design_name, yards: 0, amount: 0 };
        e.yards += Number(l.quantity);
        e.amount += Number(l.line_total);
        map.set(l.design_name, e);
      }
    }
    return [...map.values()];
  }, [data, isSupplier]);

  const totalDebit = data ? data.rows.reduce((sum, r) => sum + r.debit, 0) : 0;
  const totalCredit = data ? data.rows.reduce((sum, r) => sum + r.credit, 0) : 0;

  return (
    <Modal title={party.name} onClose={onClose} wide>
      <ErrorBox message={error} />
      {!data && !error && <div className="text-sm text-slate-500">Loading...</div>}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-slate-50 px-3 py-2"><div className="text-xs text-slate-500">{cfg.totalLabel}</div><div className="font-semibold">{fmt(totalDebit)}</div></div>
            <div className="bg-slate-50 px-3 py-2"><div className="text-xs text-slate-500">{cfg.paidLabel}</div><div className="font-semibold">{fmt(totalCredit)}</div></div>
            <div className="bg-slate-50 px-3 py-2"><div className="text-xs text-slate-500">{cfg.balanceLabel}</div><div className="font-semibold">{fmt(data.customer?.balance ?? data.supplier?.balance)}</div></div>
          </div>
          {designSummary.length > 0 && (
            <div className="border border-slate-300">
              <div className="bg-slate-50 px-3 py-1.5 text-xs uppercase tracking-wide text-slate-500">Design-wise purchases</div>
              <table className="w-full text-sm">
                <tbody>
                  {designSummary.map((d) => (
                    <tr key={d.design} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">{d.design}</td>
                      <td className="px-3 py-1.5 text-right">{qty(d.yards)} yd</td>
                      <td className="px-3 py-1.5 text-right font-medium">{fmt(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.opening_balance !== 0 && (
            <div className="flex justify-between border border-slate-200 px-3 py-2 text-sm text-slate-600">
              <span>Opening balance</span><span>{fmt(data.opening_balance)}</span>
            </div>
          )}
          {data.rows.length === 0 && <div className="text-sm text-slate-500">Nothing recorded yet.</div>}
          {data.rows.map((r) => {
            const isPayment = r.kind === 'payment';
            return (
              <div key={`${r.kind}-${r.id}`} className={`border ${isPayment ? 'border-slate-200' : 'border-black'}`}>
                <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2 ${isPayment ? 'bg-white' : 'bg-slate-50'}`}>
                  <div className="text-sm">
                    <span className="font-medium">{r.date}</span>
                    <span className="ml-3 font-mono text-xs text-slate-500">{r.reference}</span>
                    <span className="ml-3 text-xs uppercase tracking-wide text-slate-500">
                      {isPayment ? cfg.creditLabel : cfg.debitLabel}
                    </span>
                  </div>
                  <div className="text-sm font-semibold">
                    {isPayment ? `- ${fmt(r.credit)}` : fmt(r.debit)}
                    <span className="ml-3 text-xs font-normal text-slate-500">Balance {fmt(r.balance)}</span>
                  </div>
                </div>
                {isPayment && r.description && <div className="px-3 pb-2 text-xs text-slate-500">{r.description}</div>}
                {!isPayment && r.lines?.some((l) => l.images?.length) && (
                  <div className="px-3 py-2"><PhotoStrip ids={r.lines.flatMap((l) => l.images ?? [])} size={56} /></div>
                )}
                {!isPayment && r.lines?.length > 0 && <ItemsTable lines={r.lines} code={code} showMeters={isSupplier} />}
              </div>
            );
          })}
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
  const rate = useRate();

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
  const cnyOutstanding = visible.filter((p) => p.currency === 'CNY').reduce((sum, p) => sum + p.balance, 0);
  const pkrOutstanding = outstanding - cnyOutstanding;
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
          <div className="font-semibold">
            {cnyOutstanding !== 0 && <Amount value={cnyOutstanding} currency="CNY" rate={rate} />}
            {(cnyOutstanding === 0 || pkrOutstanding !== 0) && <div>{cur(pkrOutstanding, 'PKR')}</div>}
          </div>
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
                  <div className="font-medium"><button className="text-left underline-offset-2 hover:underline" onClick={() => setDialog({ type: 'statement', party: p })}>{p.name}</button>{!p.is_active && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}</div>
                  <div className="text-xs text-slate-500">{p.mobile || 'No mobile'}</div>
                  <div className="mt-2 flex flex-wrap gap-2 md:hidden">
                    <button className="rounded-lg border border-slate-300 px-3 py-1 text-xs" onClick={() => setDialog({ type: 'statement', party: p })}>Statement</button>
                    {(p.balance > 0 || p.currency === 'CNY') && (
                      <button className="rounded-lg bg-slate-900 px-3 py-1 text-xs text-white" onClick={() => setDialog({ type: 'pay', party: p })}>{cfg.payLabel}</button>
                    )}
                    <button className="rounded-lg border border-slate-300 px-3 py-1 text-xs" onClick={() => setDialog({ type: 'form', party: p })}>Edit</button>
                  </div>
                </td>
                <td className="hidden px-3 py-2 md:table-cell"><Amount value={p[cfg.totalKey]} currency={p.currency} rate={rate} /></td>
                <td className="hidden px-3 py-2 md:table-cell"><Amount value={p[cfg.paidKey]} currency={p.currency} rate={rate} /></td>
                <td className={`px-3 py-2 font-semibold ${p.balance > 0 ? 'text-amber-700' : ''}`}><Amount value={p.balance} currency={p.currency} rate={rate} />{p.balance < 0 && <span className="block text-[11px] font-normal text-slate-500">advance</span>}</td>
                <td className="hidden space-x-3 whitespace-nowrap px-3 py-2 text-right md:table-cell">
                  <button className="underline" onClick={() => setDialog({ type: 'statement', party: p })}>Statement</button>
                  {(p.balance > 0 || p.currency === 'CNY') && <button className="underline" onClick={() => setDialog({ type: 'pay', party: p })}>{cfg.payLabel}</button>}
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