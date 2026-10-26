import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { money, qty } from '../lib/format.js';
import { Button, ErrorBox, Field, PageHeader, inputClass } from '../components/ui.jsx';

const reportList = [
  { id: 'stock', label: 'Current stock by fabric', dates: false },
  { id: 'stock-by-category', label: 'Fancy vs China stock and sales', dates: true },
  { id: 'sales-by-date', label: 'Sales by date', dates: true },
  { id: 'sales-by-product', label: 'Sales by product', dates: true },
  { id: 'purchases', label: 'Purchase history', dates: true },
  { id: 'profit-by-product', label: 'Gross profit by fabric', dates: true },
  { id: 'profit-by-category', label: 'Gross profit by category', dates: true },
  { id: 'profit-by-date', label: 'Gross profit by date', dates: true },
  { id: 'receivables', label: 'Customer balances (receivable)', dates: false },
  { id: 'payables', label: 'Supplier balances (payable)', dates: false },
  { id: 'payments', label: 'Payment history', dates: true },
  { id: 'customer-statement', label: 'Customer statement', dates: true, party: 'customer' },
  { id: 'supplier-statement', label: 'Supplier statement', dates: true, party: 'supplier' },
];

function formatCell(value, type) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'money') return money(value);
  if (type === 'qty') return qty(value);
  if (type === 'int') return String(Math.round(Number(value)));
  return value;
}

export default function Reports() {
  const [reportId, setReportId] = useState('stock');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [partyId, setPartyId] = useState('');
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const meta = reportList.find((r) => r.id === reportId);

  useEffect(() => {
    Promise.all([api.get('/customers'), api.get('/suppliers')])
      .then(([c, s]) => { setCustomers(c); setSuppliers(s); })
      .catch((err) => setError(err.message));
  }, []);

  function queryString() {
    const params = new URLSearchParams();
    if (meta.dates && from) params.set('from', from);
    if (meta.dates && to) params.set('to', to);
    if (meta.party === 'customer') params.set('customer_id', partyId);
    if (meta.party === 'supplier') params.set('supplier_id', partyId);
    return params;
  }

  useEffect(() => {
    if (meta.party && !partyId) { setReport(null); return; }
    setLoading(true);
    api.get(`/reports/${reportId}?${queryString()}`)
      .then((data) => { setReport(data); setError(''); })
      .catch((err) => { setReport(null); setError(err.message); })
      .finally(() => setLoading(false));
  }, [reportId, from, to, partyId]);

  async function download(format) {
    const params = queryString();
    params.set('format', format);
    try {
      await api.download(`/reports/${reportId}/export?${params}`, `${reportId}.${format}`);
    } catch (err) {
      setError(err.message);
    }
  }

  function changeReport(id) {
    setReportId(id);
    setPartyId('');
    setReport(null);
  }

  const partyList = meta.party === 'customer' ? customers : suppliers;

  return (
    <div>
      <PageHeader title="Reports">
        <Button variant="secondary" disabled={!report} onClick={() => download('xlsx')}>Excel</Button>
        <Button variant="secondary" disabled={!report} onClick={() => download('pdf')}>PDF</Button>
      </PageHeader>
      <ErrorBox message={error} />

      <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Field label="Report">
            <select className={inputClass} value={reportId} onChange={(e) => changeReport(e.target.value)}>
              {reportList.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </Field>
        </div>
        {meta.dates && (
          <>
            <Field label="From"><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </>
        )}
        {meta.party && (
          <div className="sm:col-span-2">
            <Field label={meta.party === 'customer' ? 'Customer' : 'Supplier'}>
              <select className={inputClass} value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                <option value="">Select...</option>
                {partyList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>
        )}
      </div>

      {loading && <div className="text-slate-500">Loading...</div>}
      {!loading && !report && meta.party && <div className="text-slate-500">Select a {meta.party} to see the statement.</div>}

      {report && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">{report.title}</h2>
          {report.meta?.opening_balance !== undefined && (
            <div className="mb-2 text-sm text-slate-600">Opening balance: {money(report.meta.opening_balance)}</div>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  {report.columns.map((c) => (
                    <th key={c.key} className={`px-3 py-2 ${['money', 'qty', 'int'].includes(c.type) ? 'text-right' : ''}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 && (
                  <tr><td colSpan={report.columns.length} className="px-3 py-6 text-center text-slate-500">No data for this selection</td></tr>
                )}
                {report.rows.map((row, index) => (
                  <tr key={index} className="border-t border-slate-100">
                    {report.columns.map((c) => (
                      <td key={c.key} className={`px-3 py-2 ${['money', 'qty', 'int'].includes(c.type) ? 'text-right' : ''}`}>
                        {formatCell(row[c.key], c.type)}
                      </td>
                    ))}
                  </tr>
                ))}
                {report.totals && report.rows.length > 0 && (
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                    {report.columns.map((c, i) => (
                      <td key={c.key} className={`px-3 py-2 ${['money', 'qty', 'int'].includes(c.type) ? 'text-right' : ''}`}>
                        {i === 0 ? 'Total' : report.totals[c.key] !== undefined ? formatCell(report.totals[c.key], c.type) : ''}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}