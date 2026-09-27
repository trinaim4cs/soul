import { useEffect, useState } from 'react';

/** Browser toolbars appearing or collapsing move the viewport a little; that is not a keyboard. */
const MIN_KEYBOARD = 80;

/**
 * Height of the on-screen keyboard over the page. iPhone Safari keeps the layout viewport and
 * shrinks only the visual viewport when the keyboard opens, so pinned footers (Send code,
 * Continue) would sit under the keyboard. Android Chrome resizes the page itself
 * (`interactive-widget=resizes-content` in public/index.html), so this stays 0 there.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const covered = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
      setInset(covered >= MIN_KEYBOARD ? covered : 0);
    };
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}
