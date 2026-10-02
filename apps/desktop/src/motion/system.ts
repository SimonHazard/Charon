import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import {
  createContext,
  createElement,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react';

const KeyboardMotionContext = createContext(false);

export const useKeyboardMotion = () => useContext(KeyboardMotionContext);

export const surfaceTransition = {
  type: 'spring',
  stiffness: 360,
  damping: 38,
  mass: 1,
} as const;

export const surfaceCollapsedScale = 0.985;

/** Status check and copy confirmation: a short opacity-and-scale icon swap (docs/UX.md). */
export const iconSwapTransition = { duration: 0.12, ease: [0.2, 0, 0, 1] } as const;

export function iconSwapMotion(reduceMotion: boolean, instant: boolean) {
  // Reduced motion keeps only the crossfade; keyboard input swaps instantly.
  const hidden = reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.9)' };
  return {
    initial: hidden,
    animate: reduceMotion ? { opacity: 1 } : { opacity: 1, transform: 'scale(1)' },
    exit: hidden,
    transition: instant ? { duration: 0 } : iconSwapTransition,
  };
}

export function MotionSystem({ children }: PropsWithChildren) {
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const update = (keyboardInput: boolean) => {
      const modality = keyboardInput ? 'keyboard' : 'pointer';
      if (document.documentElement.dataset.inputModality === modality) return;
      document.documentElement.dataset.inputModality = modality;
      setKeyboard(keyboardInput);
    };
    const onKeyDown = () => update(true);
    const onPointerDown = () => update(false);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      delete document.documentElement.dataset.inputModality;
    };
  }, []);
  return createElement(
    LazyMotion,
    { features: domAnimation, strict: true },
    createElement(
      MotionConfig,
      { reducedMotion: 'user' },
      createElement(KeyboardMotionContext.Provider, { value: keyboard }, children),
    ),
  );
}
