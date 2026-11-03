import { useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useEsp32Camera } from '../hooks/useEsp32Camera';
import { useFrameAnalysis } from '../hooks/useFrameAnalysis';
import { mqttConfig } from '../services/mqttService';
import { colors } from '../theme';

// Mismos ids de modelo que usa src/api.js ('pets' = catsdogs, 'digits' = mnist).
const MODELS = [['pets', 'Perros & Gatos', colors.gold], ['digits', 'MNIST', colors.wine]];
const MIN_INTERVAL_MS = Number(process.env.EXPO_PUBLIC_ANALYSIS_INTERVAL_MS) || 1500;

const BROKER_LABEL = {
  connecting: ['Conectando…', '#fbbf24'],
  connected: ['Broker conectado', colors.green],
  reconnecting: ['Reconectando…', '#fbbf24'],
  offline: ['Broker sin conexión', '#f87171'],
  error: ['Error de conexión', '#f87171'],
};

const formatUptime = (s) => {
  if (typeof s !== 'number') return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${m} min` : m ? `${m} min ${s % 60} s` : `${s} s`;
};

const summarize = (model, r) => {
  if (model === 'pets' && 'cat_percent' in r) {
    const cat = r.cat_percent > r.dog_percent;
    return `${cat ? 'Gato' : 'Perro'} ${Math.max(r.cat_percent, r.dog_percent)}%`;
  }
  if (model === 'digits' && 'digit' in r) return `Dígito ${r.digit} · ${(r.confidence * 100).toFixed(0)}%`;
  return 'Respuesta inesperada';
};

export default function Esp32CameraScreen() {
  const cam = useEsp32Camera();
  const [model, setModel] = useState('pets');
  const [live, setLive] = useState(false);
  const analysis = useFrameAnalysis({ getFrame: cam.getFrame, model, live, minIntervalMs: MIN_INTERVAL_MS });

  const [brokerText, brokerColor] = BROKER_LABEL[cam.connection] ?? BROKER_LABEL.connecting;
  const brokerUp = cam.connection === 'connected';
  const deviceOnline = brokerUp && cam.deviceStatus === 'online';
  const deviceText = !brokerUp ? 'Dispositivo: —'
    : cam.deviceStatus === 'online' ? 'Dispositivo en línea'
      : cam.deviceStatus === 'offline' ? 'Dispositivo desconectado' : 'Esperando dispositivo…';
  const deviceColor = deviceOnline ? colors.green : cam.deviceStatus === 'offline' ? '#f87171' : '#fbbf24';

  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Cámara</Text>
      <Text style={[s.title, { color: colors.goldLight }]}>ESP32</Text>
      <Text style={s.subtitle}>
        Video en vivo por MQTT ({mqttConfig.deviceId}) con análisis opcional usando los modelos de Azure.
      </Text>

      {/* Estado */}
      <View style={s.panel}>
        <Text style={s.eyebrow}>01 — CONEXIÓN</Text>
        <View style={s.statusRow}>
          <Chip color={brokerColor} text={brokerText} />
          <Chip color={deviceColor} text={deviceText} />
        </View>
        {cam.error && !brokerUp && <Text style={s.error}>{cam.error}</Text>}
        {deviceOnline && (
          <Text style={s.telemetry}>
            RSSI {cam.telemetry?.rssi ?? '—'} dBm · Uptime {formatUptime(cam.telemetry?.uptime)}
            {cam.telemetryStale ? ' · sin telemetría reciente' : ''}
          </Text>
        )}
      </View>

      {/* Video */}
      <View style={s.panel}>
        <Text style={s.eyebrow}>02 — VIDEO</Text>
        <View style={s.zone}>
          {cam.frameUri ? (
            <Image source={{ uri: cam.frameUri }} style={s.fill} resizeMode="contain" fadeDuration={0} />
          ) : (
            <View style={s.center}>
              {(!brokerUp || deviceOnline) && <ActivityIndicator color={colors.gold} />}
              <Text style={s.zoneSub}>
                {!brokerUp ? 'Esperando conexión con el broker…'
                  : deviceOnline ? 'Esperando el primer frame…'
                    : 'El dispositivo está desconectado.'}
              </Text>
            </View>
          )}
          {cam.frameUri && brokerUp && !deviceOnline && (
            <View style={s.overlay}><Text style={s.overlayText}>Dispositivo desconectado · último frame</Text></View>
          )}
          {live && cam.frameUri && (
            <View style={s.liveChip}>
              {analysis.analyzing ? <ActivityIndicator size="small" color={colors.green} /> : <View style={s.liveDot} />}
              <Text style={s.liveChipText}>{analysis.result ? summarize(model, analysis.result) : 'Analizando…'}</Text>
            </View>
          )}
        </View>

        <View style={s.btnRow}>
          <TouchableOpacity style={[s.goldBtn, !deviceOnline && s.disabled]} disabled={!deviceOnline} onPress={cam.capture}>
            <Text style={s.goldBtnText}>Capturar foto</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.goldBtn, !deviceOnline && s.disabled]} disabled={!deviceOnline} onPress={cam.toggleLed}>
            <Text style={s.goldBtnText}>LED {cam.led ?? '—'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Análisis */}
      <View style={s.panel}>
        <Text style={s.eyebrow}>03 — ANÁLISIS</Text>
        <View style={s.modelSwitch}>
          {MODELS.map(([id, label, dot]) => (
            <TouchableOpacity key={id} style={[s.modelBtn, model === id && s.modelBtnActive]} onPress={() => setModel(id)}>
              <View style={[s.dot, { backgroundColor: dot }]} />
              <Text style={[s.modelText, model === id && { color: '#fff' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.btnRow}>
          <TouchableOpacity
            style={[s.goldBtn, live && { backgroundColor: colors.wineBg, borderColor: colors.wineBorder }, !cam.frameUri && s.disabled]}
            disabled={!cam.frameUri}
            onPress={() => setLive((v) => !v)}
          >
            <Text style={s.goldBtnText}>{live ? 'Detener análisis' : 'Analizar en vivo'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.goldBtn, { backgroundColor: colors.gold }, (!cam.frameUri || analysis.analyzing) && s.disabled]}
            disabled={!cam.frameUri || analysis.analyzing}
            onPress={analysis.analyzeNow}
          >
            <Text style={[s.goldBtnText, { color: '#05060a' }]}>Analizar frame</Text>
          </TouchableOpacity>
        </View>

        {analysis.error && <Text style={s.error}>{analysis.error}</Text>}
        {analysis.result && (
          <View style={s.resultBox}>
            <Text style={s.resultLabel}>Resultado</Text>
            <Text style={s.resultValue}>{summarize(model, analysis.result)}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Chip({ color, text }) {
  return (
    <View style={s.chip}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={s.chipText}>{text}</Text>
    </View>
  );
}

// Estilos alineados con los de App.js (mismo tema).
const s = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48 },
  title: { color: '#fff', fontSize: 34, fontWeight: '600', lineHeight: 38, letterSpacing: -1 },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 12, marginBottom: 20 },
  panel: { padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, marginBottom: 20 },
  eyebrow: { color: colors.textFaint, fontSize: 10, letterSpacing: 1.5, marginBottom: 12 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.025)' },
  chipText: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  telemetry: { color: colors.textMuted, fontSize: 12, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  zone: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(209,179,109,0.25)', backgroundColor: 'rgba(3,5,10,0.5)' },
  fill: { width: '100%', height: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  zoneSub: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, padding: 8, backgroundColor: 'rgba(125,38,58,0.7)' },
  overlayText: { color: '#fff', fontSize: 12, textAlign: 'center' },
  liveChip: { position: 'absolute', bottom: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(6,8,14,0.78)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.25)' },
  liveChipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  goldBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg },
  goldBtnText: { color: colors.goldPale, fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  modelSwitch: { flexDirection: 'row', padding: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  modelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 10 },
  modelBtnActive: { backgroundColor: 'rgba(255,255,255,0.075)' },
  modelText: { color: 'rgba(255,255,255,0.42)', fontSize: 13, fontWeight: '500' },
  resultBox: { marginTop: 14, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(209,179,109,0.2)', backgroundColor: 'rgba(195,163,95,0.07)' },
  resultLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  resultValue: { color: '#fff', fontSize: 24, fontWeight: '600', marginTop: 4 },
  error: { color: '#f87171', marginTop: 12, fontSize: 13 },
});
