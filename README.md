# movilLabCs1
App móvil en React Native (Expo) que consume una API de Azure para clasificar imágenes de gatos/perros y dígitos.
Incluye una pantalla **Cámara ESP32** que muestra video en vivo recibido por MQTT y lo analiza con esa misma API.

## Configuración

```bash
npm install
cp env.example .env   # y completa las URLs de la API y el host MQTT
npx expo start
```

Las variables `EXPO_PUBLIC_*` son las únicas que Expo expone a la app. Ver `env.example`.

## Cámara ESP32 (MQTT)

### Arquitectura

```
ESP32-CAM / mock Python ──MQTT TCP :1883──► Mosquitto ◄──MQTT WebSocket :9001── App (Expo)
                                                                                    │
                                                                       frame JPEG ──┴─► POST image ─► API Azure
                                                                                          (catsdogs | mnist)
```

La app usa MQTT sobre WebSockets (`ws://HOST:9001`) porque Expo Go no soporta sockets TCP nativos.
Polyfills (`src/polyfills.js`): `buffer` (mqtt.js y la conversión a base64 lo necesitan) y un `process` mínimo.

Código: `src/services/mqttService.js` (cliente, reconexión automática), `src/hooks/useEsp32Camera.js`
(estado/frames/comandos), `src/hooks/useFrameAnalysis.js` (envío a la API, una petición en vuelo,
intervalo mínimo de 1.5 s, sin cola), `src/screens/Esp32CameraScreen.js`.

### Contrato de topics

Base: `devices/<DEVICE_ID>/` (por defecto `esp32cam01`)

| Topic | Dirección | Contenido |
|---|---|---|
| `status` | ESP → app | `online` / `offline` (retained + LWT) |
| `telemetry` | ESP → app | JSON `{rssi, heap, uptime}` cada ~5 s |
| `camera/frame` | ESP → app | JPEG binario crudo, ~320x240 |
| `cmd/capture` | app → ESP | pide una foto inmediata |
| `cmd/led` | app → ESP | `ON` / `OFF` |
| `led/state` | ESP → app | `ON` / `OFF` (retained) |

### Probar con el mock (sin hardware)

1. Levanta Mosquitto con Docker (desde la raíz del repo):
   ```bash
   docker run -d --name mosquitto -p 1883:1883 -p 9001:9001 -v "$(pwd)/tools/esp32_mock/mosquitto.conf:/mosquitto/config/mosquitto.conf" eclipse-mosquitto:2
   ```
2. Corre el mock:
   ```bash
   cd tools/esp32_mock
   pip install -r requirements.txt
   python esp32_mock.py --host localhost                  # webcam
   python esp32_mock.py --host localhost --video clip.mp4  # o un archivo
   ```
3. En `.env` pon `EXPO_PUBLIC_MQTT_HOST` con la **IP de tu PC en la red local** (`ipconfig` / `ifconfig`),
   **no** `localhost`: el teléfono es otro dispositivo. PC y teléfono deben estar en la misma WiFi y el
   firewall debe permitir los puertos 1883 y 9001.
4. Reinicia Expo (`npx expo start -c`), abre la pestaña **Cámara ESP32**.

### Migrar al ESP32 real

Solo cambia `EXPO_PUBLIC_MQTT_HOST` (y `EXPO_PUBLIC_MQTT_PORT` si hace falta) en `.env` para apuntar al
broker real. El firmware debe respetar el contrato de topics de arriba (incluido LWT en `status`).
Si el broker usa credenciales, define `EXPO_PUBLIC_MQTT_USER` y `EXPO_PUBLIC_MQTT_PASSWORD`.
