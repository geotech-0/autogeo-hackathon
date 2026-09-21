import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { readDraft, writeDraft } from "./database";
export function useDraft<T>(
  key: string,
  initial: T | (() => T),
): readonly [
  T,
  Dispatch<SetStateAction<T>>,
  { ready: boolean; error: string | null; retry: () => void },
] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readAttempt, setReadAttempt] = useState(0);
  const generation = useRef(0);
  const hydratedGeneration = useRef<number | null>(null);
  const retry = useCallback(() => {
    // Stop pending autosaves immediately, before the next read effect runs.
    generation.current++;
    hydratedGeneration.current = null;
    setHydrated(false);
    setReady(false);
    setReadAttempt((attempt) => attempt + 1);
  }, []);
  useEffect(() => {
    let alive = true;
    const token = ++generation.current;
    hydratedGeneration.current = null;
    setReady(false);
    setHydrated(false);
    readDraft<T>(key)
      .then((saved) => {
        if (!alive || token !== generation.current) return;
        if (saved !== undefined) setValue(saved);
        hydratedGeneration.current = token;
        setHydrated(true);
        setError(null);
      })
      .catch((e) => {
        if (alive && token === generation.current) setError(String(e));
      })
      .finally(() => {
        if (alive && token === generation.current) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [key, readAttempt]);
  useEffect(() => {
    if (!ready || !hydrated) return;
    let active = true;
    const token = generation.current;
    const current = () =>
      active &&
      token === generation.current &&
      token === hydratedGeneration.current;
    const timer = setTimeout(() => {
      if (!current()) return;
      writeDraft(key, value)
        .then(() => {
          if (current()) setError(null);
        })
        .catch((e) => {
          if (current()) setError(String(e));
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, value, ready, hydrated]);
  return [value, setValue, { ready, error, retry }] as const;
}
