import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PersistentStore, Store, safeStorage, type StorageLike } from './store';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('Store', () => {
  it('avisa a los suscriptores cuando cambia', () => {
    const store = new Store({ count: 0 });
    const seen: number[] = [];
    const off = store.subscribe((state) => seen.push(state.count));
    store.set((state) => ({ count: state.count + 1 }));
    store.set((state) => ({ count: state.count + 1 }));
    off();
    store.set({ count: 99 });
    expect(seen).toEqual([1, 2]);
    expect(store.get().count).toBe(99);
  });

  it('no dispara si el estado es el mismo objeto', () => {
    const store = new Store({ count: 0 });
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.set((state) => state);
    expect(calls).toBe(0);
  });
});

describe('PersistentStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
  });

  it('escribe diferido y restaura al recargar', () => {
    const storage = memoryStorage();
    const store = new PersistentStore({ theme: 'noche' }, 'k', storage, (raw) => ({ theme: (raw as { theme: string }).theme }));
    store.set({ theme: 'grafito' });
    expect(storage.data.has('k')).toBe(false);
    vi.advanceTimersByTime(300);
    expect(JSON.parse(storage.data.get('k') ?? '{}').theme).toBe('grafito');

    const reloaded = new PersistentStore({ theme: 'noche' }, 'k', storage, (raw) => ({ theme: (raw as { theme: string }).theme }));
    expect(reloaded.get().theme).toBe('grafito');
  });

  it('sobrevive a datos corruptos', () => {
    const storage = memoryStorage();
    storage.setItem('k', '{no es json');
    const store = new PersistentStore({ theme: 'noche' }, 'k', storage);
    expect(store.get().theme).toBe('noche');
  });

  it('funciona sin almacenamiento disponible', () => {
    const store = new PersistentStore({ a: 1 }, 'k', null);
    expect(() => store.set({ a: 2 })).not.toThrow();
    expect(store.get().a).toBe(2);
  });

  it('detecta un almacenamiento inutilizable', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(safeStorage(broken)).toBe(broken);
  });
});
