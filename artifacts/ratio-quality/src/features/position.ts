import { useState } from 'react';
import type { Pos } from './geo';

export type BranchScore = Record<string, { score: number | null; cls: string | null }>;

export function useMyPosition() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'denied'>('idle');
  const locate = () => {
    if (!('geolocation' in navigator)) { setState('denied'); return; }
    setState('busy');
    navigator.geolocation.getCurrentPosition(p => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, exact: true }); setState('idle'); }, () => setState('denied'), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };
  return { pos, state, locate };
}
