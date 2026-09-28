// Svelte action: call `onpress` after the pointer is held down for `ms`.
// Used for the kiosk's hidden menu, so a stray tap never opens it.
export function longPress(node: HTMLElement, { ms = 2500, onpress }: { ms?: number; onpress: () => void }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(timer); node.classList.remove('holding'); };
  const start = (e: PointerEvent) => {
    if (e.button !== 0) return;
    cancel();
    node.classList.add('holding'); // lets the element show a subtle "keep holding" cue
    timer = setTimeout(() => { cancel(); onpress(); }, ms);
  };
  const noMenu = (e: Event) => e.preventDefault(); // touch long-press would open the context menu
  node.addEventListener('pointerdown', start);
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) node.addEventListener(type, cancel);
  node.addEventListener('contextmenu', noMenu);
  return {
    destroy() {
      cancel();
      node.removeEventListener('pointerdown', start);
      for (const type of ['pointerup', 'pointerleave', 'pointercancel']) node.removeEventListener(type, cancel);
      node.removeEventListener('contextmenu', noMenu);
    },
  };
}
