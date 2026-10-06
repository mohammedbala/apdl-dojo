// Tiny observable store.
export type Listener<T> = (value: T, prev: T) => void;

export interface Store<T> {
  get(): T;
  set(v: T): void;
  update(fn: (v: T) => T | void): void;
  subscribe(fn: Listener<T>): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<Listener<T>>();
  const emit = (prev: T) => {
    for (const s of [...subs]) s(value, prev);
  };
  return {
    get: () => value,
    set(v) {
      const prev = value;
      value = v;
      emit(prev);
    },
    update(fn) {
      const prev = value;
      const r = fn(value);
      if (r !== undefined) value = r as T;
      emit(prev);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
