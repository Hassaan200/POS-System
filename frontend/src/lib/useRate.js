import { useEffect, useState } from 'react';
import { api } from './api.js';

export default function useRate() {
  const [rate, setRate] = useState(0);
  useEffect(() => {
    api.get('/settings').then((s) => setRate(Number(s.cny_pkr_rate || 0))).catch(() => {});
  }, []);
  return rate;
}