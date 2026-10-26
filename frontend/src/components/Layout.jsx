import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/products', label: 'Products & Stock' },
  { to: '/purchases', label: 'Purchases' },
  { to: '/sales', label: 'Sales Records' },
  { to: '/customers', label: 'Customers' },
  { to: '/suppliers', label: 'Suppliers' },
  { to: '/payments', label: 'Payments' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const linkClass = ({ isActive }) =>
    `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`;

  return (
    <div className="min-h-screen lg:flex">
      <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between bg-white border-b border-slate-200 px-4 py-3">
        <span className="font-semibold">Fabric Shop</span>
        <button onClick={() => setOpen(true)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" aria-label="Open menu">
          Menu
        </button>
      </header>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 p-4 flex flex-col transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-4 px-3">
          <div className="font-semibold text-lg">Fabric Shop</div>
          <div className="text-xs text-slate-500 truncate">{user?.email}</div>
        </div>
        <nav className="space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass} onClick={() => setOpen(false)}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className="mt-4 rounded-lg border border-slate-300 px-3 py-2 text-sm text-left hover:bg-slate-50">
          Sign out
        </button>
      </aside>

      <main className="flex-1 min-w-0 p-4 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
