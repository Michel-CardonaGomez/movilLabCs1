import { useCallback, useEffect, useRef, useState } from 'react';
import { Buffer } from 'buffer';
import { createMqttService, mqttConfig } from '../services/mqttService';

const MIN_RENDER_MS = 100; // máx. ~10 fps en pantalla; los frames intermedios se descartan
const TELEMETRY_STALE_MS = 15000;

const decode = (payload) => Buffer.from(payload).toString('utf8').trim();

/**
 * Conecta al broker, expone estado, telemetría y el último frame del ESP32-CAM.
 * Los bytes crudos del frame viven en un ref (no en estado): solo se convierte a base64
 * el frame que realmente se pinta, así no se generan strings para frames descartados.
 */
export function useEsp32Camera() {
  const [connection, setConnection] = useState('connecting');
  const [deviceStatus, setDeviceStatus] = useState('unknown'); // 'online' | 'offline' | 'unknown'
  const [telemetry, setTelemetry] = useState(null);
  const [led, setLed] = useState(null); // 'ON' | 'OFF' | null
  const [frameUri, setFrameUri] = useState(null);
  const [error, setError] = useState(null);

  const serviceRef = useRef(null);
  const frameRef = useRef({ bytes: null, id: 0 });
  const lastRenderRef = useRef(0);
  const timerRef = useRef(null);

  const paintFrame = useCallback(() => {
    timerRef.current = null;
    lastRenderRef.current = Date.now();
    const { bytes } = frameRef.current;
    if (bytes) setFrameUri(`data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`);
  }, []);

  useEffect(() => {
    let service;
    try {
      service = createMqttService(mqttConfig, {
        onConnectionChange: (state) => {
          setConnection(state);
          if (state === 'connected') setError(null);
        },
        onError: (e) => setError(e?.message || 'Error de conexión MQTT'),
        onMessage: (topic, payload) => {
          const t = service.topics;
          if (topic === t.frame) {
            frameRef.current = { bytes: payload, id: frameRef.current.id + 1 };
            const wait = MIN_RENDER_MS - (Date.now() - lastRenderRef.current);
            if (wait <= 0) paintFrame();
            else if (!timerRef.current) timerRef.current = setTimeout(paintFrame, wait);
          } else if (topic === t.status) {
            const v = decode(payload);
            setDeviceStatus(v === 'online' || v === 'offline' ? v : 'unknown');
            if (v === 'offline') setTelemetry(null);
          } else if (topic === t.telemetry) {
            try { setTelemetry({ ...JSON.parse(decode(payload)), at: Date.now() }); } catch { /* JSON inválido: se ignora */ }
          } else if (topic === t.ledState) {
            const v = decode(payload);
            if (v === 'ON' || v === 'OFF') setLed(v);
          }
        },
      });
      serviceRef.current = service;
    } catch (e) {
      setError(e.message);
      setConnection('error');
    }
    return () => {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      serviceRef.current = null;
      service?.disconnect();
    };
  }, [paintFrame]);

  // Si dejan de llegar telemetrías con el dispositivo "online", se avisa en la UI.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const telemetryStale = !!telemetry && now - telemetry.at > TELEMETRY_STALE_MS;

  const capture = useCallback(() => {
    const s = serviceRef.current;
    if (s) s.publish(s.topics.cmdCapture, '1');
  }, []);

  const toggleLed = useCallback(() => {
    const s = serviceRef.current;
    if (s) s.publish(s.topics.cmdLed, led === 'ON' ? 'OFF' : 'ON');
  }, [led]);

  // Para el análisis: devuelve { bytes, id } del último frame recibido (sin copiar).
  const getFrame = useCallback(() => frameRef.current, []);

  return {
    connection, deviceStatus, telemetry, telemetryStale, led, frameUri, error,
    capture, toggleLed, getFrame,
  };
}
