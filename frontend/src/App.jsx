import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout, { navItems } from './components/Layout.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Products from './pages/Products.jsx';

const pages = {
  '/products': <Products />,
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
  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
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
