// Firestore listeners as rune-backed state. Call from a component's <script> so
// the $effect is owned by (and torn down with) that component.
import { onSnapshot, type DocumentReference, type FirestoreError, type Query } from 'firebase/firestore';

export interface Live<T> { readonly value: T; readonly fromCache: boolean; readonly error: FirestoreError | null }

export function liveDoc<T>(ref: () => DocumentReference | null, onError?: (e: FirestoreError) => void): Live<T | null> {
  let value = $state<T | null>(null);
  let fromCache = $state(true);
  let error = $state<FirestoreError | null>(null);
  $effect(() => {
    const r = ref();
    value = null;
    error = null;
    if (!r) return;
    return onSnapshot(r, { includeMetadataChanges: true }, (snap) => {
      value = (snap.data() as T | undefined) ?? null;
      fromCache = snap.metadata.fromCache;
    }, (e) => { error = e; onError?.(e); });
  });
  return { get value() { return value; }, get fromCache() { return fromCache; }, get error() { return error; } };
}

export function liveQuery<T>(query: () => Query | null): Live<(T & { id: string })[]> {
  let value = $state<(T & { id: string })[]>([]);
  let fromCache = $state(true);
  let error = $state<FirestoreError | null>(null);
  $effect(() => {
    const q = query();
    value = [];
    error = null;
    if (!q) return;
    return onSnapshot(q, (snap) => {
      value = snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
      fromCache = snap.metadata.fromCache;
    }, (e) => { error = e; });
  });
  return { get value() { return value; }, get fromCache() { return fromCache; }, get error() { return error; } };
}

/** A clock that re-renders every `ms`. */
export function ticker(ms = 1000): { readonly now: number } {
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => { now = Date.now(); }, ms);
    return () => clearInterval(id);
  });
  return { get now() { return now; } };
}

/** navigator.onLine as state. */
export function online(): { readonly value: boolean } {
  let value = $state(navigator.onLine);
  $effect(() => {
    const update = () => { value = navigator.onLine; };
    addEventListener('online', update);
    addEventListener('offline', update);
    return () => { removeEventListener('online', update); removeEventListener('offline', update); };
  });
  return { get value() { return value; } };
}
