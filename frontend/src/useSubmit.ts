import { useCallback, useRef, useState } from "react";

/** Busy flag + error line for a form's submit: `run` ignores taps while one is in flight and turns a thrown Error into text. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const run = useCallback(async (task: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}
