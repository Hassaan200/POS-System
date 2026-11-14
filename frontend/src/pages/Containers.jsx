import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, newKey } from '../lib/api.js';
import { money, today } from '../lib/format.js';
import { Button, ErrorBox, Field, Modal, PageHeader, inputClass } from '../components/ui.jsx';

function ContainerForm({ row, names, onClose, onSaved }) {
  const key = useRef(newKey());
  const [form, setForm] = useState({
    delivery_date: row?.delivery_date?.slice(0, 10) || today(),
    container_no: row?.container_no || '',
    party_name: row?.party_name || '',
    weight_kg: row ? String(row.weight_kg) : '',
    bales: row ? String(row.bales) : '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { ...form, weight_kg: Number(form.weight_kg), bales: Number(form.bales) };
    try {
      if (row) await api.put(`/containers/${row.id}`, body);
      else await api.post('/containers', body, key.current);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={row ? 'Edit container' : 'New container'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={error} />
        <Field label="Date"><input required type="date" className={inputClass} value={form.delivery_date} onChange={set('delivery_date')} /></Field>
        <Field label="Container number">
          <input required autoFocus autoCapitalize="characters" className={`${inputClass} font-mono uppercase`} value={form.container_no} onChange={set('container_no')} />
        </Field>
        <Field label="Name (Durrani / Zia ...)">
          <input required list="container-names" className={inputClass} value={form.party_name} onChange={set('party_name')} />
          <datalist id="container-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight (KG)"><input required type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={form.weight_kg} onChange={set('weight_kg')} /></Field>
          <Field label="Bales"><input required type="number" min="0" step="1" inputMode="numeric" className={inputClass} value={form.bales} onChange={set('bales')} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Containers() {
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (search.trim()) params.set('search', search.trim());
    try {
      setRows(await api.get(`/containers?${params}`));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function voidRow(row) {
    if (!window.confirm(`Void container ${row.container_no}?`)) return;
    try {
      await api.post(`/containers/${row.id}/void`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const active = rows.filter((r) => r.status === 'active');
  const totalKg = active.reduce((sum, r) => sum + Number(r.weight_kg), 0);
  const totalBales = active.reduce((sum, r) => sum + Number(r.bales), 0);
  const names = useMemo(() => [...new Set(rows.map((r) => r.party_name))], [rows]);

  return (
    <div>
      <PageHeader title="Containers"><Button onClick={() => setEditing('new')}>New container</Button></PageHeader>
      <ErrorBox message={error} />
      <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:max-w-2xl">
        <Field label="From"><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Search"><input className={inputClass} placeholder="Container no. or name" value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
      </div>
      <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-xl">
        <div className="border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Containers</div><div className="text-lg font-semibold">{active.length}</div></div>
        <div className="border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Total KG</div><div className="text-lg font-semibold">{money(totalKg)}</div></div>
        <div className="border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Total bales</div><div className="text-lg font-semibold">{totalBales}</div></div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2 sm:px-3">Date</th><th className="px-2 py-2 sm:px-3">Container no.</th><th className="px-2 py-2 sm:px-3">Name</th>
              <th className="px-2 py-2 text-right sm:px-3">KG</th><th className="px-2 py-2 text-right sm:px-3">Bales</th><th className="hidden px-3 py-2 sm:table-cell" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="6" className="px-3 py-6 text-center text-slate-500">Loading...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan="6" className="px-3 py-6 text-center text-slate-500">No containers yet</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-slate-100 ${r.status === 'void' ? 'text-slate-400 line-through' : ''}`}>
                <td className="px-2 py-2 sm:whitespace-nowrap sm:px-3"><span className="sm:hidden">{String(r.delivery_date).slice(5, 10)}</span><span className="hidden sm:inline">{String(r.delivery_date).slice(0, 10)}</span></td>
                <td className="break-all px-2 py-2 font-mono sm:px-3">{r.container_no}</td>
                <td className="px-2 py-2 sm:px-3">
                  {r.party_name}
                  <div className="mt-1 space-x-3 sm:hidden">
                  {r.status === 'active' ? (
                    <>
                      <button className="underline" onClick={() => setEditing(r)}>Edit</button>
                      <button className="text-red-600 underline" onClick={() => voidRow(r)}>Void</button>
                    </>
                  ) : 'Voided'}
                  </div>
                </td>
                <td className="px-2 py-2 text-right sm:px-3">{money(r.weight_kg)}</td>
                <td className="px-2 py-2 text-right sm:px-3">{r.bales}</td>
                <td className="hidden space-x-3 whitespace-nowrap px-3 py-2 text-right sm:table-cell">
                  {r.status === 'active' ? (
                    <>
                      <button className="underline" onClick={() => setEditing(r)}>Edit</button>
                      <button className="text-red-600 underline" onClick={() => voidRow(r)}>Void</button>
                    </>
                  ) : 'Voided'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <ContainerForm row={editing === 'new' ? null : editing} names={names} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}