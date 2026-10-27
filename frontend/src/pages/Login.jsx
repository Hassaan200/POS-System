import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, ErrorBox, Field, inputClass } from '../components/ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <section className="weave relative flex min-h-[250px] flex-col justify-between overflow-hidden p-8 text-white lg:p-14">
        <div lang="ur" dir="rtl" className="font-urdu text-2xl text-white/80">درانی</div>
        <div className="py-10">
          <div className="font-display italic leading-[0.92]" style={{ fontSize: 'clamp(3.75rem, 10vw, 8.5rem)' }}>
            Durrani
          </div>
          <div className="mt-4 text-lg text-white/70">Fabric Shop</div>
        </div>
        <div aria-hidden="true" className="-mx-8 lg:-mx-14">
          <div className="flex overflow-hidden text-[11px] tabular-nums text-white/50">
            {Array.from({ length: 40 }, (_, i) => (
              <span key={i} className="w-[40px] shrink-0 pl-1">{i}</span>
            ))}
          </div>
          <div className="tape tape-light opacity-70" />
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-14">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 style={{ fontSize: '2.5rem' }}>Sign in</h2>
            <p className="mt-2 text-sm text-slate-500">Use the shop's shared login.</p>
          </div>

          <ErrorBox message={error} />

          <Field label="Email">
            <input
              type="email" required autoComplete="username" className={inputClass}
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label="Password">
            <input
              type="password" required autoComplete="current-password" className={inputClass}
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <Button type="submit" disabled={busy} className="w-full py-3">
            {busy ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </section>
    </div>
  );
}