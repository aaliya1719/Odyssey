import { useCallback, useState } from 'react';
import { chime, readSoundEnabled, writeSoundEnabled } from '../lib/chime';

/** The Sound toggle: muted by default, remembered in localStorage like the theme. */
export function useSound() {
  const [soundEnabled, setSoundEnabled] = useState(() => readSoundEnabled());

  const toggleSound = useCallback(() => {
    const next = !soundEnabled;
    writeSoundEnabled(next);
    setSoundEnabled(next);
    if (next) {
      // this click is the user gesture that lets the browser start audio; the soft tick confirms it works
      chime.play('tick');
    }
  }, [soundEnabled]);

  return { soundEnabled, toggleSound };
}
