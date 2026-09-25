// Keep the classroom display awake with the Screen Wake Lock API. No video hacks:
// where the API is missing or refused, say so quietly and let the screen sleep.

export type WakeState = 'pending' | 'active' | 'unsupported' | 'denied';

export function wakeLock(enabled: () => boolean): { readonly state: WakeState } {
  let state = $state<WakeState>('pending');
  $effect(() => {
    if (!enabled()) return;
    if (!('wakeLock' in navigator)) { state = 'unsupported'; return; }
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (stopped || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        state = 'active';
        sentinel.addEventListener('release', () => { if (!stopped) state = 'pending'; });
      } catch {
        state = 'denied';
      }
    };
    // The browser drops the lock whenever the page is hidden; take it back on return.
    const onVisible = () => { if (document.visibilityState === 'visible') void acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    void acquire();
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  });
  return { get state() { return state; } };
}
