import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { money, qty } from '../lib/format.js';
import { ErrorBox, Field, PageHeader, inputClass } from '../components/ui.jsx';

function useCountUp(target, ms = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return value;
}

function Money({ value, className = '' }) {
  const [whole, cents] = money(value).split('.');
  return (
    <span className={className}>
      {whole}
      <span className="text-[0.5em] opacity-60">.{cents}</span>
    </span>
  );
}

function HeroFigure({ label, value, count, emptyText, unit, currency }) {
  const shown = useCountUp(value);
  return (
    <div>
      <div className="text-sm text-white/60">{label}</div>
      <div className="mt-3 font-display leading-none" style={{ fontSize: 'clamp(2.6rem, 6vw, 4.6rem)' }}>
        <span className="mr-2 font-sans text-base text-white/60">{currency}</span>
        <Money value={shown} />
      </div>
      <div className="mt-3 text-sm text-white/60">{count > 0 ? `${count} ${unit}${count === 1 ? '' : 's'} recorded` : emptyText}</div>
    </div>
  );
}

function LedgerRow({ label, children, strong = false }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-3 ${strong ? '' : 'border-b border-slate-200'}`}>
      <dt className={strong ? 'font-medium' : 'text-slate-600'}>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [grown, setGrown] = useState(false);

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

  useEffect(() => {
    if (!data) return undefined;
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [Boolean(data)]);

  if (!data) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        {error ? <ErrorBox message={error} /> : <div className="text-slate-500">Loading...</div>}
      </div>
    );
  }

  const cur = data.currency;
  const profit = data.profit;
  const owedTotal = data.receivable + data.payable;
  const receivablePct = owedTotal > 0 ? (data.receivable / owedTotal) * 100 : 0;
  const net = Math.round((data.receivable - data.payable) * 100) / 100;
  const maxYards = Math.max(1, ...data.stock.by_category.map((c) => c.yards));
  const dateLine = new Date(`${data.today}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div>
      <PageHeader title="Dashboard" />
      <ErrorBox message={error} />

      <section className="weave mb-12 p-6 text-white sm:p-10">
        <div className="font-display text-xl italic text-white/80">{dateLine}</div>
        <div className="mt-8 grid gap-10 sm:grid-cols-2">
          <HeroFigure
            label="Sales today" value={data.today_sales.total} count={data.today_sales.count}
            unit="sale" emptyText="No sales recorded yet" currency={cur}
          />
          <HeroFigure
            label="Purchases today" value={data.today_purchases.total} count={data.today_purchases.count}
            unit="purchase" emptyText="No purchases recorded yet" currency={cur}
          />
        </div>
        <div className="tape tape-light mt-10 opacity-60" aria-hidden="true" />
      </section>

      <div className="grid gap-x-16 gap-y-12 lg:grid-cols-2">
        <section>
          <h2>Money owed</h2>
          <dl className="mt-4">
            <LedgerRow label="Customers owe you">
              <span className="mr-2 inline-block h-2.5 w-2.5 bg-black align-middle" aria-hidden="true" />
              <span className="font-medium">{cur} {money(data.receivable)}</span>
            </LedgerRow>
            <LedgerRow label="You owe suppliers">
              <span className="hatch mr-2 inline-block h-2.5 w-2.5 align-middle" aria-hidden="true" />
              <span className="font-medium">{cur} {money(data.payable)}</span>
            </LedgerRow>
          </dl>
          <div className="mt-4 flex h-3 overflow-hidden border border-black bg-white" aria-hidden="true">
            <div className="h-full bg-black transition-[width] duration-700 ease-out" style={{ width: grown ? `${receivablePct}%` : '0%' }} />
            <div className="hatch h-full flex-1 border-0 shadow-none" />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            {net > 0 && `Customers owe you ${cur} ${money(net)} more than you owe suppliers.`}
            {net < 0 && `You owe suppliers ${cur} ${money(-net)} more than customers owe you.`}
            {net === 0 && 'What you owe and what you are owed are equal.'}
          </p>
        </section>

        <section>
          <h2>Stock</h2>
          {data.stock.total_yards > 0 ? (
            <>
              <div className="mt-4 font-display leading-none" style={{ fontSize: '3.5rem' }}>
                {qty(data.stock.total_yards)}
                <span className="ml-2 font-sans text-base text-slate-500">yards</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">Worth {cur} {money(data.stock.total_value)} at cost.</p>
            </>
          ) : (
            <p className="mt-4 text-slate-600">No stock yet. Add a fabric under Products & Stock, then record a purchase.</p>
          )}
          <ul className="mt-6 space-y-4">
            {data.stock.by_category.map((c) => (
              <li key={c.category}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{c.category}</span>
                  <span className="tabular-nums text-slate-600">{qty(c.yards)} yards</span>
                </div>
                <div className="mt-1.5 h-2 bg-slate-100">
                  <div
                    className="h-full bg-black transition-[width] duration-700 ease-out"
                    style={{ width: grown ? `${(Math.max(c.yards, 0) / maxYards) * 100}%` : '0%' }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2>Gross profit</h2>
            <p className="mt-1 text-sm text-slate-500">{profit.from} to {profit.to}. Shows this month until you pick dates.</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 sm:w-80">
            <Field label="From"><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        </div>
        <dl className="mt-4 max-w-xl">
          <LedgerRow label="Net sales"><span>{cur} {money(profit.revenue)}</span></LedgerRow>
          <LedgerRow label="Cost of fabric sold"><span>{cur} {money(profit.cogs)}</span></LedgerRow>
          <div className="border-b-[3px] border-double border-black">
            <LedgerRow label="Gross profit" strong>
              <Money value={profit.gross_profit} className={`font-display text-3xl ${profit.gross_profit < 0 ? 'text-red-700' : ''}`} />
            </LedgerRow>
          </div>
        </dl>
      </section>
    </div>
  );
}