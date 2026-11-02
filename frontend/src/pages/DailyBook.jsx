import { useCallback, useEffect, useRef, useState } from 'react';
import { api, newKey } from '../lib/api.js';
import { money, today } from '../lib/format.js';
import { Button, ErrorBox, Field, PageHeader, inputClass } from '../components/ui.jsx';

const categories = [
  ['food_tea', 'Khana / Chai-Pani'],
  ['salary', 'Tankhwah'],
  ['advance', 'Advance'],
  ['rent', 'Kiraya'],
  ['utilities', 'Bijli / Bill'],
  ['transport', 'Transport'],
  ['other', 'Other'],
];
const categoryLabel = Object.fromEntries(categories);

const shiftDate = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function ColumnTotal({ label, value }) {
  return (
    <div className="mt-2 border-b-[3px] border-double border-black">
      <div className="flex items-baseline justify-between py-3">
        <span className="font-medium">{label}</span>
        <span className="font-display text-2xl tabular-nums">{money(value)}</span>
      </div>
    </div>
  );
}

export default function DailyBook() {
  const [date, setDate] = useState(today());
  const [book, setBook] = useState(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [category, setCategory] = useState('food_tea');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const keyRef = useRef(newKey());

    const load = useCallback(async () => {
    setPageLoading(true); // <-- Yeh add kiya
    try {
      setBook(await api.get(`/expenses/daily-book?date=${date}`));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setPageLoading(false); // <-- Yeh add kiya
    }
  }, [date]);


  useEffect(() => { load(); }, [load]);

  async function addExpense(event) {
    event.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      await api.post('/expenses', { expense_date: date, category, description, amount: Number(amount) }, keyRef.current);
      keyRef.current = newKey();
      setDescription('');
      setAmount('');
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function voidExpense(row) {
    if (!window.confirm(`Cancel this expense: ${row.description} (${money(row.amount)})?`)) return;
    try {
      await api.post(`/expenses/${row.id}/void`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const totals = book?.totals;

  return (
    <div>
      <PageHeader title="Daily Book">
        <button className="border border-black px-3 py-2 text-sm hover:bg-black hover:text-white" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">&larr;</button>
        <input type="date" className={`${inputClass} !w-auto`} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="border border-black px-3 py-2 text-sm hover:bg-black hover:text-white" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">&rarr;</button>
        <button className="border border-black px-3 py-2 text-sm hover:bg-black hover:text-white" onClick={() => setDate(today())}>Today</button>
      </PageHeader>
        <ErrorBox message={error} />

      {/* === YAHAN SE LEKAR END TAK CODE IS TARAH UPDATE KREIN === */}
      {pageLoading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-4 min-h-[400px]">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-black rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-slate-400 animate-pulse tracking-wide">
            Loading daybook records...
          </p>
        </div>
      ) : (
        <>
          {totals && (
            <section className="weave mb-10 grid gap-6 p-6 text-white sm:grid-cols-3 sm:p-8">
              <div>
                <div className="text-sm text-white/60">Sales (aamdan)</div>
                <div className="mt-1 font-display text-3xl tabular-nums sm:text-4xl">{money(totals.sales)}</div>
              </div>
              <div>
                <div className="text-sm text-white/60">Kharcha (rafat)</div>
                <div className="mt-1 font-display text-3xl tabular-nums sm:text-4xl">{money(totals.expenses)}</div>
              </div>
              <div>
                <div className="text-sm text-white/60">Bacha (sales minus kharcha)</div>
                <div className={`mt-1 font-display text-3xl tabular-nums sm:text-4xl ${totals.balance < 0 ? 'text-red-400' : ''}`}>{money(totals.balance)}</div>
              </div>
            </section>
          )}

          {book && (
            <div className="grid gap-x-14 gap-y-12 lg:grid-cols-2">
              <section className="min-w-0">
                <h2>Sales</h2>
                <ul className="mt-4">
                  {book.sales.length === 0 && <li className="border-b border-slate-200 py-3 text-slate-500">Is din koi sale nahi.</li>}
                  {book.sales.map((s) => (
                    <li key={s.id} className={`flex items-baseline justify-between gap-4 border-b border-slate-200 py-3 ${s.status === 'cancelled' ? 'text-slate-400 line-through' : ''}`}>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{s.customer_name || 'Walk-in'}</div>
                        <div className="truncate text-xs text-slate-500">{s.ref}{s.items ? ` · ${s.items}` : ''}</div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div>{money(s.total_amount)}</div>
                        {s.status === 'active' && s.remaining_amount > 0 && <div className="text-xs text-slate-500">udhar {money(s.remaining_amount)}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
                <ColumnTotal label="Total sales" value={totals.sales} />
                <p className="mt-2 text-sm text-slate-500">Aaj customers se cash mila: {money(totals.cash_received)} (purane udhar ki wapsi bhi shamil).</p>
              </section>

              <section className="min-w-0">
                <h2>Kharcha</h2>
                <form onSubmit={addExpense} className="mt-4 space-y-3 border border-black p-4">
                  <ErrorBox message={formError} />
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                    <Field label="Kis cheez ka">
                      <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                        {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </Field>
                    <Field label="Amount">
                      <input type="number" inputMode="decimal" step="any" min="0" required className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Detail">
                    <input required maxLength={255} className={inputClass} placeholder="Maslan: 2 cold drink, Ali ko advance" value={description} onChange={(e) => setDescription(e.target.value)} />
                  </Field>
                  <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving...' : 'Kharcha likho'}</Button>
                </form>

                <ul className="mt-4">
                  {book.expenses.length === 0 && <li className="border-b border-slate-200 py-3 text-slate-500">Is din koi kharcha nahi.</li>}
                  {book.expenses.map((e) => (
                    <li key={e.id} className={`flex items-baseline justify-between gap-4 border-b border-slate-200 py-3 ${e.status === 'void' ? 'text-slate-400 line-through' : ''}`}>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{e.description}</div>
                        <div className="text-xs text-slate-500">{categoryLabel[e.category] || e.category}</div>
                      </div>
                      <div className="flex items-baseline gap-3 text-right">
                        <span className="tabular-nums">{money(e.amount)}</span>
                        {e.status === 'active'
                          ? <button className="text-xs text-red-700 underline" onClick={() => voidExpense(e)}>Cancel</button>
                          : <span className="text-xs">Cancelled</span>}
                      </div>
                    </li>
                  ))}
                </ul>
                <ColumnTotal label="Total kharcha" value={totals.expenses} />
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
