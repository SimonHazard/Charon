import { useMotionValue } from 'motion/react';
import { useCallback } from 'react';

export function usePressFeedback() {
  const scale = useMotionValue(1);
  const press = useCallback(() => scale.set(0.98), [scale]);
  const release = useCallback(() => scale.set(1), [scale]);

  return {
    style: { scale },
    onPointerDown: press,
    onPointerUp: release,
    onPointerCancel: release,
    onPointerLeave: release,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') press();
    },
    onKeyUp: release,
  };
}
