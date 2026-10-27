import { useEffect } from 'react';

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-black focus:ring-1 focus:ring-black disabled:bg-slate-100 disabled:text-slate-500';

const buttonStyles = {
  primary: 'border border-black bg-black text-white hover:bg-white hover:text-black',
  secondary: 'border border-black bg-white text-black hover:bg-black hover:text-white',
  danger: 'border border-red-700 bg-white text-red-700 hover:bg-red-700 hover:text-white',
};

export function Button({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      type="button"
      className={`rounded-lg px-5 py-2.5 text-sm font-medium tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block text-sm">
      <span className="text-[13px] font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <div role="alert" className="border border-l-4 border-red-300 border-l-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </div>
  );
}

export function PageHeader({ title, children }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-3">
        <h1>{title}</h1>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
      <div className="tape" aria-hidden="true" />
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-[2px] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-panel w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} border border-black bg-white p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2>{title}</h2>
          <button onClick={onClose} className="-mr-2 -mt-1 p-2 text-slate-500 hover:text-black" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}