import { useEffect, useState, useSyncExternalStore } from 'react';

/** Armazena um snapshot imutável e notifica assinantes — base das sessões (fora do React). */
export class Store<T extends object> {
  private listeners = new Set<() => void>();
  constructor(protected snap: T) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  protected patch(p: Partial<T>) {
    let changed = false;
    for (const k in p) {
      if (!Object.is(p[k], this.snap[k])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.snap = { ...this.snap, ...p };
    this.listeners.forEach((fn) => fn());
  }
}

export function useStore<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/**
 * Cria um objeto com ciclo de vida (sessões) dentro de um efeito, garantindo um dispose()
 * correto mesmo com o duplo-montar do React StrictMode.
 */
export function useDisposable<T extends { dispose(): void }>(factory: () => T | null, deps: unknown[]): T | null {
  const [inst, setInst] = useState<T | null>(null);
  useEffect(() => {
    const created = factory();
    setInst(created);
    return () => created?.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return inst;
}
