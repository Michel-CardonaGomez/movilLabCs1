// Polyfills que mqtt.js necesita en React Native (el runtime no es Node ni navegador).
// Importar este archivo ANTES de 'mqtt'.
//
// - buffer: mqtt.js usa Buffer para armar/leer paquetes; Hermes no lo trae. También lo
//   usamos para convertir el JPEG binario de cada frame a base64.
// - process: algunas dependencias de mqtt consultan process.nextTick / process.env.
// WebSocket y Promise vienen nativos en React Native, no hace falta polyfill.
import { Buffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = Buffer;
if (typeof globalThis.process === 'undefined') globalThis.process = { env: {} };
if (!globalThis.process.nextTick) globalThis.process.nextTick = (fn, ...args) => setTimeout(() => fn(...args), 0);
