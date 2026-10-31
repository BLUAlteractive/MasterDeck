import { useReducedMotion } from './useReducedMotion';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
type Feedback = {
  reduceMotion: boolean;
  sound: boolean;
  haptics: boolean;
  setSound: (enabled: boolean) => void;
  setHaptics: (enabled: boolean) => void;
  tap: () => void;
};
const context = createContext<Feedback>({
  reduceMotion: true,
  sound: false,
  haptics: false,
  setSound: () => {},
  setHaptics: () => {},
  tap: () => {},
});
export const useFeedback = () => useContext(context);
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [sound, setSound] = useState(false),
    [haptics, setHaptics] = useState(false),
    live = useRef(true),
    enabled = useRef({ sound, haptics }),
    player = useRef<import('expo-audio').AudioPlayer | null>(null),
    inFlight = useRef(false);
  enabled.current = { sound, haptics };
  useEffect(() => {
    live.current = true;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') player.current?.pause();
    });
    return () => {
      live.current = false;
      sub.remove();
      player.current?.remove();
      player.current = null;
    };
  }, []);
  useEffect(() => {
    if (!sound) player.current?.pause();
  }, [sound]);
  function tap() {
    if (!live.current || AppState.currentState !== 'active') return;
    if (enabled.current.haptics)
      void import('expo-haptics')
        .then((m) => {
          if (
            live.current &&
            enabled.current.haptics &&
            AppState.currentState === 'active'
          )
            return m.selectionAsync();
        })
        .catch(() => {});
    if (!enabled.current.sound || inFlight.current) return;
    inFlight.current = true;
    void (async () => {
      try {
        if (!player.current) {
          const audio = await import('expo-audio');
          if (!live.current || !enabled.current.sound) return;
          // Static original bundled asset; required lazily so SSR never initializes native audio.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const source = require('../../assets/sounds/tap.wav');
          player.current = audio.createAudioPlayer(source);
          player.current.volume = 0.15;
        }
        await player.current.seekTo(0);
        if (
          live.current &&
          enabled.current.sound &&
          AppState.currentState === 'active'
        )
          player.current.play();
      } catch {
        /* Optional feedback never blocks a game command. */
      } finally {
        inFlight.current = false;
      }
    })();
  }
  return (
    <context.Provider
      value={{ reduceMotion, sound, haptics, setSound, setHaptics, tap }}
    >
      {children}
    </context.Provider>
  );
}
