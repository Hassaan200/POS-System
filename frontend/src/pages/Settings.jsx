import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Button, ErrorBox, Field, PageHeader, inputClass } from '../components/ui.jsx';

const Notice = ({ message }) =>
  message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null;

function ShopSettings() {
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.get('/settings').then(setForm).catch((err) => setError(err.message));
  }, []);

  if (!form) return <ErrorBox message={error} />;

  async function save(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      setForm(await api.put('/settings', form));
      setNotice('Settings saved');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold">Shop settings</h2>
      <ErrorBox message={error} />
      <Notice message={notice} />
      <Field label="Shop name"><input className={inputClass} value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></Field>
      <Field label="Currency"><input className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></Field>
      <Field label="Yuan rate (PKR for 1 ¥)" hint="Used as the default when you enter a purchase or pay the supplier. You can change it on each entry.">
        <input type="number" min="0" step="0.0001" inputMode="decimal" className={inputClass} value={form.cny_pkr_rate ?? 0} onChange={(e) => setForm({ ...form, cny_pkr_rate: e.target.value })} />
      </Field>
      <Field label="Timezone" hint="Decides what counts as 'today' on the dashboard">
        <input className={inputClass} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={form.allow_oversell} onChange={(e) => setForm({ ...form, allow_oversell: e.target.checked })} />
        <span>Allow selling more than available stock<br /><span className="text-xs text-slate-500">Keep this off unless you really need it. Stock can go negative.</span></span>
      </label>
      <Button type="submit">Save settings</Button>
    </form>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await api.post('/auth/change-password', { current_password: current, new_password: next });
      setCurrent('');
      setNext('');
      setNotice('Password changed. Tell the other user the new password.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold">Change shared password</h2>
      <ErrorBox message={error} />
      <Notice message={notice} />
      <Field label="Current password"><input required type="password" autoComplete="current-password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
      <Field label="New password" hint="At least 10 characters">
        <input required type="password" autoComplete="new-password" minLength={10} className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Button type="submit">Change password</Button>
    </form>
  );
}

function IntegrityCheck() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function run() {
    setError('');
    try {
      setResult(await api.get('/settings/integrity'));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold">Data check</h2>
      <p className="text-sm text-slate-600">Compares every fabric's stock with its full movement history to make sure the numbers agree.</p>
      <ErrorBox message={error} />
      {result && (result.ok
        ? <Notice message="All stock numbers match the transaction history." />
        : <ErrorBox message={`Mismatch found for: ${result.problems.map((p) => p.code).join(', ')}`} />)}
      <Button variant="secondary" onClick={run}>Run check</Button>
    </div>
  );
}

function ResetData() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function run(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/settings/reset-data', { confirm, password });
      setDone(true);
      setOpen(false);
      setConfirm('');
      setPassword('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-red-300 bg-white p-4">
      <h2 className="font-semibold text-red-700">Delete all data</h2>
      <p className="text-sm text-slate-600">
        Removes all fabrics, sets, suppliers, customers, purchases, sales, payments and expenses. Login, shop settings and categories stay. This cannot be undone.
      </p>
      {done && <Notice message="All data deleted. You can start fresh." />}
      {!open && <Button variant="danger" onClick={() => { setOpen(true); setDone(false); }}>Delete all data...</Button>}
      {open && (
        <form onSubmit={run} className="space-y-3">
          <ErrorBox message={error} />
          <Field label="Type DELETE ALL DATA to confirm"><input required className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <Field label="Your password"><input required type="password" autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" type="submit">Delete everything</Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function Settings() {
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="grid max-w-xl grid-cols-1 gap-4">
        <ShopSettings />
        <ChangePassword />
        <IntegrityCheck />
        <ResetData />
      </div>
    </div>
  );
}