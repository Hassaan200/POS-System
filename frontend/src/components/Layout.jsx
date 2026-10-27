import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export const navItems = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/products', label: 'Products & Stock', icon: 'products' },
  { to: '/purchases', label: 'Purchases', icon: 'purchases' },
  { to: '/sales', label: 'Sales Records', icon: 'sales' },
  { to: '/customers', label: 'Customers', icon: 'customers' },
  { to: '/suppliers', label: 'Suppliers', icon: 'suppliers' },
  { to: '/payments', label: 'Payments', icon: 'payments' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

const icons = {
  dashboard: <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />,
  products: <path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8" />,
  purchases: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  sales: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6" />,
  customers: <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M9 4.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM17 14c2.8 0 4.5 1.8 4.5 4.5M17 6.5a2.5 2.5 0 110 5" />,
  suppliers: <path d="M3 6h11v10H3zM14 10h4l3 3v3h-7M7 16.5a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6zM17 16.5a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6z" />,
  payments: <path d="M3 6h18v12H3zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM6 9v.01M18 15v.01" />,
  reports: <path d="M4 20h16M7 20v-9M12 20V5M17 20v-6" />,
  settings: <path d="M4 7h10M18 7h2M4 17h2M10 17h10M16 4.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM8 14.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />,
};

function Icon({ name }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

function Brand({ size = 'text-[34px]' }) {
  return (
    <div>
      <div className={`font-display ${size} italic leading-none`}>Durrani</div>
      <div className="mt-1.5 text-[13px] text-white/60">Fabric Shop</div>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 text-[14.5px] transition-colors ${
      isActive ? 'bg-white font-medium text-black' : 'text-white/70 hover:bg-white/10 hover:text-white'
    }`;

  return (
    <div className="min-h-screen lg:flex">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-black px-4 py-3 text-white lg:hidden">
        <Brand size="text-[26px]" />
        <button onClick={() => setOpen(true)} className="-mr-2 p-2" aria-label="Open menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 7h18M3 12h18M3 17h18" />
          </svg>
        </button>
      </header>

      {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-black text-white transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-7 pb-5 pt-8">
          <Brand />
        </div>
        <div className="tape tape-light mx-7 opacity-50" aria-hidden="true" />
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-4 py-6">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass} onClick={() => setOpen(false)}>
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/15 px-7 py-5">
          <div className="truncate text-[13px] text-white/60">{user?.email}</div>
          <button
            onClick={logout}
            className="mt-3 w-full border border-white/40 px-3 py-2 text-sm text-white transition-colors hover:bg-white hover:text-black"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}