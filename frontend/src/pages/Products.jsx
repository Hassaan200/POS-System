import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { money, qty } from '../lib/format.js';
import { Button, ErrorBox, Field, Modal, PageHeader, inputClass } from '../components/ui.jsx';

const emptyForm = {
  name: '', code: '', category_id: '', fabric_type_id: '',
  opening_stock: '0', purchase_cost: '0', is_active: true,
};

function ProductForm({ product, catalog, onClose, onSaved }) {
  const [form, setForm] = useState(
    product
      ? {
        name: product.name, code: product.code, category_id: String(product.category_id),
        fabric_type_id: product.fabric_type_id ? String(product.fabric_type_id) : '',
        opening_stock: String(product.opening_stock), purchase_cost: String(product.purchase_cost),
        is_active: Boolean(product.is_active),
      }
      : emptyForm
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const types = useMemo(
    () => catalog.find((c) => String(c.id) === form.category_id)?.types || [],
    [catalog, form.category_id]
  );
  const openingLocked = product && (product.purchased_qty > 0 || product.sold_qty > 0);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const payload = {
      name: form.name,
      code: form.code,
      category_id: Number(form.category_id),
      fabric_type_id: form.fabric_type_id ? Number(form.fabric_type_id) : null,
      opening_stock: Number(form.opening_stock),
      purchase_cost: Number(form.purchase_cost),
    };
    try {
      if (product) await api.put(`/products/${product.id}`, { ...payload, is_active: form.is_active });
      else await api.post('/products', payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={product ? 'Edit Fabric' : 'Add Fabric'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox message={error} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fabric name">
            <input required className={inputClass} value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Product code">
            <input required className={inputClass} value={form.code} onChange={set('code')} />
          </Field>
          <Field label="Category">
            <select
              required
              className={inputClass}
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value, fabric_type_id: '' }))}
            >
              <option value="">Select category</option>
              {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Fabric type">
            <select className={inputClass} value={form.fabric_type_id} onChange={set('fabric_type_id')} disabled={!types.length}>
              <option value="">{types.length ? 'No specific type' : 'No types in this category'}</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field
            label="Opening stock (yards)"
            hint={openingLocked ? 'Locked because purchases or sales already exist' : 'Stock you already have today'}
          >
            <input
              type="number" min="0" step="any" inputMode="decimal" className={inputClass}
              value={form.opening_stock} onChange={set('opening_stock')} disabled={openingLocked}
            />
          </Field>
          <Field label="Purchase cost per yard" hint="Used to value opening stock">
            <input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={form.purchase_cost} onChange={set('purchase_cost')} />
          </Field>
          {/* <Field label="Selling rate per yard">
            <input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={form.selling_rate} onChange={set('selling_rate')} />
          </Field> */}
          {product && (
            <label className="flex items-center gap-2 text-sm sm:mt-7">
              <input
                type="checkbox" checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Active (can be used in new entries)
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function CatalogManager({ catalog, onClose, onChanged }) {
  const [newCategory, setNewCategory] = useState('');
  const [typeNames, setTypeNames] = useState({});
  const [error, setError] = useState('');

  async function run(action) {
    setError('');
    try {
      onChanged(await action());
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="Categories & Fabric Types" onClose={onClose}>
      <div className="space-y-4">
        <ErrorBox message={error} />
        {catalog.map((category) => (
          <div key={category.id} className="rounded-lg border border-slate-200 p-3">
            <div className="font-medium">{category.name}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {category.types.length === 0 && <span className="text-sm text-slate-500">No types yet</span>}
              {category.types.map((t) => (
                <span key={t.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{t.name}</span>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = (typeNames[category.id] || '').trim();
                if (!name) return;
                run(async () => {
                  const data = await api.post(`/catalog/categories/${category.id}/types`, { name });
                  setTypeNames((s) => ({ ...s, [category.id]: '' }));
                  return data;
                });
              }}
            >
              <input
                className={inputClass} placeholder="New type name"
                value={typeNames[category.id] || ''}
                onChange={(e) => setTypeNames((s) => ({ ...s, [category.id]: e.target.value }))}
              />
              <Button type="submit" variant="secondary">Add</Button>
            </form>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newCategory.trim();
            if (!name) return;
            run(async () => {
              const data = await api.post('/catalog/categories', { name });
              setNewCategory('');
              return data;
            });
          }}
        >
          <input className={inputClass} placeholder="New category name" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          <Button type="submit">Add category</Button>
        </form>
      </div>
    </Modal>
  );
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [managing, setManaging] = useState(false);

  const load = useCallback(async () => {
    try {
      const [productList, catalogList] = await Promise.all([api.get('/products'), api.get('/catalog')]);
      setProducts(productList);
      setCatalog(catalogList);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!showInactive && !p.is_active) return false;
      if (categoryFilter && String(p.category_id) !== categoryFilter) return false;
      if (!term) return true;
      return p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term);
    });
  }, [products, search, categoryFilter, showInactive]);

  const totalYards = visible.reduce((sum, p) => sum + p.stock_qty, 0);
  const totalValue = visible.reduce((sum, p) => sum + p.stock_value, 0);

  return (
    <div>
      <PageHeader title="Products & Stock">
        <Button variant="secondary" onClick={() => setManaging(true)}>Categories & Types</Button>
        <Button onClick={() => setEditing('new')}>Add Fabric</Button>
      </PageHeader>

      <ErrorBox message={error} />

      <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input className={`${inputClass} sm:col-span-2`} placeholder="Search by name or code" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={inputClass} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Stock shown (yards)</div>
          <div className="text-xl font-semibold">{qty(totalYards)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Stock value at cost</div>
          <div className="text-xl font-semibold">{money(totalValue)}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Fabric</th>
              <th className="hidden px-3 py-2 md:table-cell">Opening</th>
              <th className="hidden px-3 py-2 md:table-cell">Purchased</th>
              <th className="hidden px-3 py-2 md:table-cell">Sold</th>
              <th className="px-3 py-2">Current yards</th>
              <th className="hidden px-3 py-2 lg:table-cell">Avg cost</th>
              {/* <th className="px-3 py-2">Sell rate</th> */}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="9" className="px-3 py-6 text-center text-slate-500">Loading...</td></tr>}
            {!loading && visible.length === 0 && (
              <tr><td colSpan="9" className="px-3 py-6 text-center text-slate-500">No fabrics found</td></tr>
            )}
            {visible.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{p.name}{!p.is_active && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}</div>
                  <div className="text-xs text-slate-500">{p.category_name}{p.type_name ? ` / ${p.type_name}` : ''}</div>
                </td>
                <td className="hidden px-3 py-2 md:table-cell">{qty(p.opening_stock)}</td>
                <td className="hidden px-3 py-2 md:table-cell">{qty(p.purchased_qty)}</td>
                <td className="hidden px-3 py-2 md:table-cell">{qty(p.sold_qty)}</td>
                <td className={`px-3 py-2 font-semibold ${p.stock_qty < 0 ? 'text-red-600' : ''}`}>{qty(p.stock_qty)}</td>
                <td className="hidden px-3 py-2 lg:table-cell">{money(p.avg_cost)}</td>
                {/* <td className="px-3 py-2">{money(p.selling_rate)}</td> */}
                <td className="px-3 py-2 text-right">
                  <button className="text-sm text-slate-700 underline" onClick={() => setEditing(p)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {managing && (
        <CatalogManager catalog={catalog} onClose={() => setManaging(false)} onChanged={setCatalog} />
      )}
    </div>
  );
}
