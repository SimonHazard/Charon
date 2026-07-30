import { useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

export type MotionPreferences = {
  reducedMotion: boolean;
  reducedTransparency: boolean;
  increasedContrast: boolean;
};

export const preferenceQueries = {
  reducedTransparency: '(prefers-reduced-transparency: reduce)',
  increasedContrast: '(prefers-contrast: more)',
} as const;

function useMediaPreference(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);

  useEffect(() => {
    const media = matchMedia(query);
    const update = () => setMatches(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

export function useMotionPreferences(): MotionPreferences {
  return {
    reducedMotion: useReducedMotion() ?? false,
    reducedTransparency: useMediaPreference(preferenceQueries.reducedTransparency),
    increasedContrast: useMediaPreference(preferenceQueries.increasedContrast),
  };
}
