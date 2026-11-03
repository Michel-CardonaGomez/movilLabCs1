import { useCallback, useEffect, useRef, useState } from 'react';
import { File, Paths } from 'expo-file-system';
import { predict } from '../api';

const REQUEST_TIMEOUT_MS = 15000;

/**
 * Envía frames a la API reutilizando predict() de src/api.js.
 * - Solo UNA petición en vuelo: si hay una activa, el ciclo se descarta (nunca se encola).
 * - En modo "live" se evalúa cada `minIntervalMs`, siempre sobre el frame más reciente
 *   y solo si llegó uno nuevo desde el último análisis.
 */
export function useFrameAnalysis({ getFrame, model, live, minIntervalMs = 1500 }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const busyRef = useRef(false);
  const lastIdRef = useRef(0);
  const mountedRef = useRef(true);
  const abortRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; abortRef.current?.abort(); };
  }, []);

  // Al cambiar de modelo el resultado anterior deja de ser válido.
  useEffect(() => { setResult(null); setError(null); lastIdRef.current = 0; }, [model]);

  const run = useCallback(async ({ onlyNew }) => {
    if (busyRef.current) return;
    const { bytes, id } = getFrame();
    if (!bytes || (onlyNew && id === lastIdRef.current)) return;

    busyRef.current = true;
    lastIdRef.current = id;
    setAnalyzing(true);
    // La API espera un archivo: el frame se guarda en caché solo mientras dura la petición.
    const file = new File(Paths.cache, `esp32-frame-${Date.now()}.jpg`);
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      await file.write(new Uint8Array(bytes)); // asíncrono desde SDK 58
      const r = await predict(model, file.uri, { signal: controller.signal });
      if (!mountedRef.current) return;
      if (r && typeof r === 'object') { setResult(r); setError(null); }
      else setError('Respuesta inesperada del servidor.');
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e?.name === 'AbortError' ? 'La API tardó demasiado en responder.' : e?.message || 'No se pudo analizar el frame.');
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      try { file.delete(); } catch { /* ya no existe */ }
      busyRef.current = false;
      if (mountedRef.current) setAnalyzing(false);
    }
  }, [getFrame, model]);

  useEffect(() => {
    if (!live) return;
    run({ onlyNew: true });
    const id = setInterval(() => run({ onlyNew: true }), minIntervalMs);
    return () => clearInterval(id);
  }, [live, minIntervalMs, run]);

  const analyzeNow = useCallback(() => run({ onlyNew: false }), [run]);

  return { result, error, analyzing, analyzeNow };
}
