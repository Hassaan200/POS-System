import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout, { navItems } from './components/Layout.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Products from './pages/Products.jsx';
import Purchases from './pages/Purchases.jsx';
import Sales from './pages/Sales.jsx';
import { Customers, Suppliers } from './pages/Parties.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Containers from './pages/Containers.jsx';
import Payments from './pages/Payments.jsx';
import DailyBook from './pages/DailyBook.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';

const pages = {
  '/': <Dashboard />,
  '/daily-book': <DailyBook />,
  '/payments': <Payments />,
  '/containers': <Containers />,
  '/reports': <Reports />,
  '/settings': <Settings />,
  '/products': <Products />,
  '/purchases': <Purchases />,
  '/sales': <Sales />,
  '/customers': <Customers />,
  '/suppliers': <Suppliers />,
};

function ComingSoon({ title }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-slate-500">This module will be built in the next steps.</p>
    </div>
  );
}

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
  return (
    <div className="flex flex-col items-center justify-center p-12 space-y-4 min-h-[200px]">
      {/* Smooth Spinning Circle */}
      <div className="w-10 h-10 border-4 border-slate-200 border-t-gray-900 rounded-full animate-spin"></div>
      
      {/* Subtle modern text */}
      <p className="text-sm font-medium text-slate-500 animate-pulse tracking-wide">
        Loading data...
      </p>
    </div>
  );
}

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Layout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        {navItems.map((item) => (
          <Route
            key={item.to}
            path={item.to}
            element={pages[item.to] || <ComingSoon title={item.label} />}
          />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
