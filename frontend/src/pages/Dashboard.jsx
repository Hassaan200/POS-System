import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { money, qty } from '../lib/format.js';
import { ErrorBox, Field, PageHeader, inputClass } from '../components/ui.jsx';

function Card({ label, value, sub, tone = '' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try {
      setData(await api.get(`/dashboard?${params}`));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  if (!data) return <div>{error ? <ErrorBox message={error} /> : <div className="text-slate-500">Loading...</div>}</div>;

  const cur = data.currency;
  const profit = data.profit;

  return (
    <div>
      <PageHeader title="Dashboard" />
      <ErrorBox message={error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Total stock (yards)" value={qty(data.stock.total_yards)} sub={`Value at cost: ${cur} ${money(data.stock.total_value)}`} />
        <Card label="Today's sales" value={`${cur} ${money(data.today_sales.total)}`} sub={`${data.today_sales.count} sale(s)`} />
        <Card label="Today's purchases" value={`${cur} ${money(data.today_purchases.total)}`} sub={`${data.today_purchases.count} purchase(s)`} />
        <Card label="Customers owe you" value={`${cur} ${money(data.receivable)}`} tone="text-amber-700" />
        <Card label="You owe suppliers" value={`${cur} ${money(data.payable)}`} tone="text-red-700" />
      </div>

      <h2 className="mb-2 mt-6 text-lg font-semibold">Stock by category</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.stock.by_category.map((c) => (
          <Card key={c.category} label={c.category} value={`${qty(c.yards)} yards`} sub={`Value at cost: ${cur} ${money(c.value)}`} />
        ))}
      </div>

      <h2 className="mb-2 mt-6 text-lg font-semibold">Gross profit</h2>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:w-96">
        <Field label="From"><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="mb-2 text-xs text-slate-500">Period: {profit.from} to {profit.to} (default is this month)</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card label="Net sales" value={`${cur} ${money(profit.revenue)}`} />
        <Card label="Cost of fabric sold" value={`${cur} ${money(profit.cogs)}`} />
        <Card label="Gross profit" value={`${cur} ${money(profit.gross_profit)}`} tone={profit.gross_profit < 0 ? 'text-red-700' : 'text-emerald-700'} />
      </div>
    </div>
  );
}