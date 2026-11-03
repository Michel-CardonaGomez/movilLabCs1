"""Mock de un ESP32-CAM: publica el contrato MQTT de devices/<DEVICE_ID>/ sin hardware.

Uso:
    python esp32_mock.py --host localhost                 # webcam 0
    python esp32_mock.py --host localhost --video clip.mp4 # archivo (en bucle)
"""
import argparse
import json
import threading
import time

import cv2
import paho.mqtt.client as mqtt


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="localhost", help="broker MQTT (puerto TCP)")
    p.add_argument("--port", type=int, default=1883)
    p.add_argument("--device-id", default="esp32cam01")
    p.add_argument("--video", help="archivo .mp4; si se omite se usa la webcam")
    p.add_argument("--camera", type=int, default=0, help="índice de la webcam")
    p.add_argument("--fps", type=float, default=8)
    p.add_argument("--quality", type=int, default=70, help="calidad JPEG 1-100")
    args = p.parse_args()

    base = f"devices/{args.device_id}"
    t_status, t_tele, t_frame = f"{base}/status", f"{base}/telemetry", f"{base}/camera/frame"
    t_capture, t_cmd_led, t_led = f"{base}/cmd/capture", f"{base}/cmd/led", f"{base}/led/state"

    cap = cv2.VideoCapture(args.video if args.video else args.camera)
    if not cap.isOpened():
        raise SystemExit("No se pudo abrir la fuente de video.")

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.will_set(t_status, "offline", qos=1, retain=True)  # LWT
    capture_requested = threading.Event()
    led = {"state": "OFF"}

    def on_connect(c, userdata, flags, reason_code, properties):
        print(f"Conectado al broker ({reason_code})")
        c.subscribe([(t_capture, 0), (t_cmd_led, 0)])
        c.publish(t_status, "online", qos=1, retain=True)
        c.publish(t_led, led["state"], qos=1, retain=True)

    def on_message(c, userdata, msg):
        payload = msg.payload.decode(errors="ignore").strip().upper()
        if msg.topic == t_capture:
            print("cmd/capture")
            capture_requested.set()
        elif msg.topic == t_cmd_led and payload in ("ON", "OFF"):
            print(f"cmd/led {payload}")
            led["state"] = payload
            c.publish(t_led, payload, qos=1, retain=True)

    client.on_connect, client.on_message = on_connect, on_message
    client.connect(args.host, args.port, keepalive=30)
    client.loop_start()

    def read_frame():
        ok, frame = cap.read()
        if not ok and args.video:  # fin del archivo: vuelve al inicio
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = cap.read()
        return frame if ok else None

    def encode(frame):
        frame = cv2.resize(frame, (320, 240))
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, args.quality])
        return buf.tobytes() if ok else None

    start = time.time()
    last_tele = 0.0
    period = 1.0 / args.fps
    try:
        while True:
            t0 = time.time()
            frame = read_frame()
            if frame is not None:
                jpg = encode(frame)
                if jpg:
                    client.publish(t_frame, jpg, qos=0)
                    if capture_requested.is_set():  # foto inmediata (mismo topic, según el contrato)
                        capture_requested.clear()
                        client.publish(t_frame, jpg, qos=0)
            if t0 - last_tele >= 5:
                last_tele = t0
                client.publish(t_tele, json.dumps({
                    "rssi": -55, "heap": 180000, "uptime": int(t0 - start),
                }))
            time.sleep(max(0, period - (time.time() - t0)))
    except KeyboardInterrupt:
        pass
    finally:
        client.publish(t_status, "offline", qos=1, retain=True).wait_for_publish(2)
        client.loop_stop()
        client.disconnect()
        cap.release()


if __name__ == "__main__":
    main()
