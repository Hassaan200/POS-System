import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { resizeImage } from '../lib/image.js';

const cache = new Map();

function useServerImage(id) {
  const [url, setUrl] = useState(cache.get(id) ?? null);
  useEffect(() => {
    if (cache.has(id)) { setUrl(cache.get(id)); return; }
    let live = true;
    api.blob(`/purchases/images/${id}`).then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      cache.set(id, objectUrl);
      if (live) setUrl(objectUrl);
    }).catch(() => {});
    return () => { live = false; };
  }, [id]);
  return url;
}

function Lightbox({ src, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <img src={src} alt="" className="max-h-full max-w-full object-contain" />
    </div>
  );
}

function Tile({ src, onOpen, onRemove, size }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {src
        ? <button type="button" className="block h-full w-full" onClick={() => onOpen(src)}><img src={src} alt="" className="h-full w-full border border-slate-300 object-cover" /></button>
        : <div className="h-full w-full animate-pulse bg-slate-100" />}
      {onRemove && (
        <button type="button" aria-label="Remove photo" className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-black text-xs leading-5 text-white" onClick={onRemove}>×</button>
      )}
    </div>
  );
}

function ServerTile({ id, onOpen, onRemove, size }) {
  return <Tile src={useServerImage(id)} onOpen={onOpen} onRemove={onRemove} size={size} />;
}

export function PhotoStrip({ ids, size = 56, onRemove }) {
  const [open, setOpen] = useState(null);
  if (!ids.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => <ServerTile key={id} id={id} size={size} onOpen={setOpen} onRemove={onRemove ? () => onRemove(id) : undefined} />)}
      </div>
      {open && <Lightbox src={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export const MAX_PHOTOS = 3;

export function PhotoPicker({ photos, onChange, max = MAX_PHOTOS, size = 64, label = 'Add photo' }) {
  const input = useRef(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  async function pick(e) {
    const files = [...e.target.files].slice(0, max - photos.length);
    e.target.value = '';
    setError('');
    try {
      const added = [];
      for (const file of files) {
        const blob = await resizeImage(file);
        added.push({ blob, url: URL.createObjectURL(blob) });
      }
      onChange([...photos, ...added]);
    } catch (err) { setError(err.message); }
  }

  function remove(i) {
    URL.revokeObjectURL(photos[i].url);
    onChange(photos.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((p, i) => <Tile key={p.url} src={p.url} size={size} onOpen={setOpen} onRemove={() => remove(i)} />)}
        {photos.length < max && (
          <button type="button" className="border border-dashed border-slate-400 px-3 text-sm" style={{ height: size }} onClick={() => input.current.click()}>
            + {label}
          </button>
        )}
        <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={pick} />
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {open && <Lightbox src={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function AddPhotoButton({ lineId, onDone, onError }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  async function pick(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await api.upload(`/purchases/lines/${lineId}/images`, await resizeImage(file));
      await onDone();
    } catch (err) { onError(err.message); } finally { setBusy(false); }
  }

  return (
    <>
      <button type="button" disabled={busy} className="border border-dashed border-slate-400 px-3 py-2 text-sm" onClick={() => input.current.click()}>
        {busy ? 'Uploading...' : '+ Add photo'}
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
    </>
  );
}