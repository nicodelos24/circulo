export type StoreListener<T> = (state: T, previous: T) => void;
export type Updater<T> = (state: T) => T;

/** Store observable mínimo: inmutable superficial y sin dependencias. */
export class Store<T extends object> {
  private state: T;
  private readonly listeners = new Set<StoreListener<T>>();

  constructor(initial: T) {
    this.state = initial;
  }

  get(): T {
    return this.state;
  }

  set(updater: Updater<T> | Partial<T>): void {
    const next = typeof updater === 'function' ? (updater as Updater<T>)(this.state) : { ...this.state, ...updater };
    if (next === this.state) return;
    const previous = this.state;
    this.state = next;
    for (const listener of [...this.listeners]) listener(this.state, previous);
  }

  subscribe(listener: StoreListener<T>, fireImmediately = false): () => void {
    this.listeners.add(listener);
    if (fireImmediately) listener(this.state, this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function safeStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = '__circulo_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Store con persistencia diferida: agrupa las escrituras para no tocar
 * localStorage en cada gesto del dedo.
 */
export class PersistentStore<T extends object> extends Store<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    initial: T,
    private readonly key: string,
    private readonly storage: StorageLike | null = safeStorage(),
    private readonly revive: (raw: unknown) => T = (raw) => ({ ...initial, ...(raw as object) }) as T,
    private readonly delay = 250,
  ) {
    super(initial);
    this.hydrate();
  }

  private hydrate(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return;
      this.set(this.revive(JSON.parse(raw)));
    } catch {
      /* estado corrupto: se empieza de cero */
    }
  }

  override set(updater: Updater<T> | Partial<T>): void {
    super.set(updater);
    this.schedule();
  }

  private schedule(): void {
    if (!this.storage) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.storage?.setItem(this.key, JSON.stringify(this.get()));
      } catch {
        /* cuota llena o modo privado */
      }
    }, this.delay);
  }

  flush(): void {
    if (!this.storage) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.get()));
    } catch {
      /* ignorado */
    }
  }
}
