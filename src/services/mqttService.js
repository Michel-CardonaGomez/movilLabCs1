import '../polyfills';
import mqtt from 'mqtt';

// Configuración 100% por entorno (ver env.example). Sin IPs ni secretos en el código.
export const mqttConfig = {
  host: process.env.EXPO_PUBLIC_MQTT_HOST,
  port: process.env.EXPO_PUBLIC_MQTT_PORT || '9001',
  deviceId: process.env.EXPO_PUBLIC_MQTT_DEVICE_ID || 'esp32cam01',
  // Opcionales: el broker actual es anónimo.
  username: process.env.EXPO_PUBLIC_MQTT_USER || undefined,
  password: process.env.EXPO_PUBLIC_MQTT_PASSWORD || undefined,
};

export const topicsFor = (deviceId) => {
  const base = `devices/${deviceId}`;
  return {
    status: `${base}/status`,
    telemetry: `${base}/telemetry`,
    frame: `${base}/camera/frame`,
    ledState: `${base}/led/state`,
    cmdCapture: `${base}/cmd/capture`,
    cmdLed: `${base}/cmd/led`,
  };
};

/**
 * Cliente MQTT sobre WebSockets (ws://HOST:PORT). Reconecta solo cada 2 s.
 * handlers: { onConnectionChange(state), onMessage(topic, payload: Uint8Array), onError(err) }
 * state: 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'error'
 */
export function createMqttService({ host, port, deviceId, username, password }, handlers) {
  if (!host) throw new Error('Falta EXPO_PUBLIC_MQTT_HOST en el archivo .env');
  const topics = topicsFor(deviceId);
  const subscriptions = [topics.status, topics.telemetry, topics.frame, topics.ledState];

  const client = mqtt.connect(`ws://${host}:${port}`, {
    clientId: `movil-${Math.random().toString(16).slice(2, 10)}`,
    username,
    password,
    reconnectPeriod: 2000,
    connectTimeout: 8000,
    clean: true,
  });

  handlers.onConnectionChange?.('connecting');
  client.on('connect', () => {
    // Se re-suscribe en cada (re)conexión porque la sesión es clean.
    client.subscribe(subscriptions, { qos: 0 });
    handlers.onConnectionChange?.('connected');
  });
  client.on('reconnect', () => handlers.onConnectionChange?.('reconnecting'));
  client.on('offline', () => handlers.onConnectionChange?.('offline'));
  client.on('error', (err) => {
    handlers.onError?.(err);
    handlers.onConnectionChange?.('error');
  });
  client.on('message', (topic, payload) => handlers.onMessage?.(topic, payload));

  return {
    topics,
    publish: (topic, message) => {
      if (client.connected) client.publish(topic, message, { qos: 0 });
    },
    disconnect: () => {
      client.removeAllListeners();
      client.on('error', () => {}); // evita errores no capturados durante el cierre
      client.end(true);
    },
  };
}
