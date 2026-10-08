import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, StatusBar,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { predict } from './src/api';
import DrawPad from './src/DrawPad';
import { colors } from './src/theme';

const MODES = [
  { id: 'upload', label: 'Imagen' },
  { id: 'camera', label: 'Cámara' },
  { id: 'draw', label: 'Dibujar' },
];

export default function App() {
  const [model, setModel] = useState('pets'); // 'pets' | 'digits'
  const [mode, setMode] = useState('upload');
  const [uploadUri, setUploadUri] = useState(null);
  const [cameraUri, setCameraUri] = useState(null);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(false); // predicción continua con la cámara
  const [scrollEnabled, setScrollEnabled] = useState(true); // se apaga mientras se dibuja
  const busyRef = useRef(false);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const drawRef = useRef(null);

  const changeModel = (next) => {
    setLive(false);
    setModel(next);
    setResult(null);
    setError(null);
    setMode(next === 'digits' ? 'draw' : mode === 'draw' ? 'upload' : mode);
  };

  const changeMode = (next) => {
    if (model === 'pets' && next === 'draw') return; // dibujar solo para dígitos
    setLive(false);
    setMode(next);
    setResult(null);
    setError(null);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError('Necesitas dar permiso para acceder a tus fotos.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!r.canceled) { setUploadUri(r.assets[0].uri); setResult(null); setError(null); }
  };

  const takePhoto = async () => {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
    if (photo) { setCameraUri(photo.uri); setResult(null); setError(null); }
  };

  // Tiempo real: toma una foto pequeña cada ~1.2 s y la envía a la API.
  // Si la petición anterior no ha terminado, se salta ese ciclo para no saturar.
  useEffect(() => {
    if (!live || mode !== 'camera') return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || busyRef.current) return;
      busyRef.current = true;
      try {
        const photo = await cameraRef.current?.takePictureAsync({
          quality: 0.4, scale: 0.5, skipProcessing: true, shutterSound: false,
        });
        if (photo && !cancelled) {
          const r = await predict(model, photo.uri);
          if (!cancelled) { setResult(r); setError(null); }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Error en la predicción en vivo.');
      } finally {
        busyRef.current = false;
      }
    };

    tick();
    const id = setInterval(tick, 1200);
    return () => { cancelled = true; clearInterval(id); };
  }, [live, mode, model]);

  const liveSummary = !result
    ? 'Analizando…'
    : model === 'pets'
      ? `${result.cat_percent > result.dog_percent ? 'Gato' : 'Perro'} ${Math.max(result.cat_percent, result.dog_percent)}%`
      : `Dígito ${result.digit} · ${(result.confidence * 100).toFixed(0)}%`;

  const currentUri = mode === 'upload' ? uploadUri : mode === 'camera' ? cameraUri : null;
  const canAnalyze = mode === 'draw' ? hasDrawing : !!currentUri;

  const analyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const uri = mode === 'draw' ? await drawRef.current.capture() : currentUri;
      setResult(await predict(model, uri));
    } catch (e) {
      setError(e.message || 'No se pudo analizar la imagen.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <Text style={s.brand}>CSLab</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} scrollEnabled={scrollEnabled}>
        <Text style={s.title}>Explora modelos de</Text>
        <Text style={[s.title, { color: colors.goldLight }]}>Machine Learning</Text>
        <Text style={s.subtitle}>
          Carga una imagen, utiliza tu cámara o dibuja para obtener una predicción instantánea.
        </Text>

        {/* Selector de modelo */}
        <View style={s.modelSwitch}>
          {[['pets', 'Perros & Gatos', colors.gold], ['digits', 'MNIST', colors.wine]].map(([id, label, dot]) => (
            <TouchableOpacity key={id} style={[s.modelBtn, model === id && s.modelBtnActive]} onPress={() => changeModel(id)}>
              <View style={[s.dot, { backgroundColor: dot }]} />
              <Text style={[s.modelText, model === id && { color: '#fff' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Panel de entrada */}
        <View style={s.panel}>
          <Text style={s.eyebrow}>01 — ENTRADA</Text>
          <Text style={s.panelTitle}>Selecciona una fuente</Text>

          <View style={s.modeTabs}>
            {MODES.map((m) => {
              const disabled = model === 'pets' && m.id === 'draw';
              return (
                <TouchableOpacity
                  key={m.id}
                  disabled={disabled}
                  style={[s.modeBtn, mode === m.id && s.modeBtnActive]}
                  onPress={() => changeMode(m.id)}
                >
                  <Text style={[s.modeText, mode === m.id && { color: colors.goldPale }, disabled && { opacity: 0.4 }]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {mode === 'upload' && (
            <TouchableOpacity style={s.zone} onPress={pickImage} activeOpacity={0.8}>
              {uploadUri ? (
                <Image source={{ uri: uploadUri }} style={s.fill} resizeMode="cover" />
              ) : (
                <View style={s.center}>
                  <Text style={s.zoneTitle}>Selecciona una imagen</Text>
                  <Text style={s.zoneSub}>Toca para explorar tu galería</Text>
                  <View style={s.goldBtn}><Text style={s.goldBtnText}>Seleccionar imagen</Text></View>
                </View>
              )}
            </TouchableOpacity>
          )}

          {mode === 'camera' && (
            <View style={s.zone}>
              {cameraUri ? (
                <>
                  <Image source={{ uri: cameraUri }} style={s.fill} resizeMode="cover" />
                  <TouchableOpacity style={s.floatBtn} onPress={() => setCameraUri(null)}>
                    <Text style={s.floatText}>Repetir foto</Text>
                  </TouchableOpacity>
                </>
              ) : permission?.granted ? (
                <>
                  <CameraView ref={cameraRef} style={s.fill} facing="back" />
                  {live && (
                    <View style={s.liveChip}>
                      <View style={s.liveDot} />
                      <Text style={s.liveChipText}>{liveSummary}</Text>
                    </View>
                  )}
                  <View style={s.camActions}>
                    <TouchableOpacity
                      style={[s.goldBtn, live && { backgroundColor: colors.wineBg, borderColor: colors.wineBorder }]}
                      onPress={() => { setResult(null); setError(null); setLive((v) => !v); }}
                    >
                      <Text style={s.goldBtnText}>{live ? 'Detener' : 'Tiempo real'}</Text>
                    </TouchableOpacity>
                    {!live && (
                      <TouchableOpacity style={[s.goldBtn, { backgroundColor: colors.gold }]} onPress={takePhoto}>
                        <Text style={[s.goldBtnText, { color: '#05060a' }]}>Capturar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              ) : (
                <View style={s.center}>
                  <Text style={s.zoneTitle}>Activa la cámara</Text>
                  <Text style={s.zoneSub}>Permite el acceso para tomar una foto.</Text>
                  <TouchableOpacity style={s.goldBtn} onPress={requestPermission}>
                    <Text style={s.goldBtnText}>Activar cámara</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {mode === 'draw' && <DrawPad ref={drawRef} onChange={setHasDrawing} onDrawingActive={(active) => setScrollEnabled(!active)} />}

          <TouchableOpacity
            style={[s.analyzeBtn, (!canAnalyze || loading || live) && { opacity: 0.4 }]}
            disabled={!canAnalyze || loading || live}
            onPress={analyze}
          >
            {loading ? <ActivityIndicator color="#05060a" /> : <Text style={s.analyzeText}>Analizar</Text>}
          </TouchableOpacity>
          {error && <Text style={s.error}>{error}</Text>}
        </View>

        {/* Panel de resultados */}
        <View style={s.panel}>
          <View style={s.rowBetween}>
            <View>
              <Text style={s.eyebrow}>02 — SALIDA</Text>
              <Text style={s.panelTitle}>Resultado del análisis</Text>
            </View>
            <View style={s.live}><View style={s.liveDot} /><Text style={s.liveText}>Live</Text></View>
          </View>

          {!result && <Text style={s.empty}>Aún no hay resultados. Elige una imagen y toca Analizar.</Text>}

          {result && model === 'pets' && (
            <View style={{ marginTop: 16, gap: 12 }}>
              <PetScore label="Gato" value={result.cat_percent} bar={colors.gold} />
              <PetScore label="Perro" value={result.dog_percent} bar="rgba(255,255,255,0.18)" />
            </View>
          )}

          {result && model === 'digits' && (
            <View style={s.digitBox}>
              <Text style={s.digitLabel}>Número detectado</Text>
              <Text style={s.digitValue}>{result.digit}</Text>
              <View style={s.rowBetween}>
                <Text style={s.digitLabel}>Confianza</Text>
                <Text style={s.digitPct}>{(result.confidence * 100).toFixed(1)}%</Text>
              </View>
              <View style={s.track}>
                <View style={[s.bar, { width: `${Math.min(100, result.confidence * 100)}%`, backgroundColor: colors.wineBar }]} />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function PetScore({ label, value, bar }) {
  const primary = value > 50;
  return (
    <View style={[s.pet, primary && s.petPrimary]}>
      <View style={s.rowBetween}>
        <Text style={s.petLabel}>{label}</Text>
        {primary && <Text style={s.match}>Mayor match</Text>}
      </View>
      <Text style={s.petValue}>{value}%</Text>
      <View style={s.track}><View style={[s.bar, { width: `${value}%`, backgroundColor: bar }]} /></View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 52, paddingBottom: 14, paddingHorizontal: 20, backgroundColor: colors.header, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  brand: { color: '#fff', fontSize: 15, fontWeight: '600' },
  content: { padding: 20, paddingBottom: 48 },
  title: { color: '#fff', fontSize: 34, fontWeight: '600', lineHeight: 38, letterSpacing: -1 },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 12, marginBottom: 20 },
  modelSwitch: { flexDirection: 'row', padding: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, marginBottom: 20 },
  modelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 10 },
  modelBtnActive: { backgroundColor: 'rgba(255,255,255,0.075)' },
  modelText: { color: 'rgba(255,255,255,0.42)', fontSize: 13, fontWeight: '500' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  panel: { padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, marginBottom: 20 },
  eyebrow: { color: colors.textFaint, fontSize: 10, letterSpacing: 1.5 },
  panelTitle: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: '600', marginTop: 4, marginBottom: 14 },
  modeTabs: { flexDirection: 'row', padding: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', backgroundColor: 'rgba(255,255,255,0.025)', marginBottom: 14 },
  modeBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 },
  modeBtnActive: { backgroundColor: colors.goldBg, borderWidth: 1, borderColor: 'rgba(195,163,95,0.18)' },
  modeText: { color: colors.textFaint, fontSize: 13 },
  zone: { width: '100%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(209,179,109,0.25)', backgroundColor: 'rgba(3,5,10,0.5)' },
  fill: { width: '100%', height: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  zoneTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  zoneSub: { color: colors.textMuted, fontSize: 12, marginTop: 6, marginBottom: 16, textAlign: 'center' },
  goldBtn: { paddingVertical: 11, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg },
  goldBtnText: { color: colors.goldPale, fontSize: 13, fontWeight: '600' },
  camActions: { position: 'absolute', bottom: 14, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  liveChip: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(6,8,14,0.78)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.25)' },
  liveChipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  floatBtn: { position: 'absolute', right: 12, bottom: 12, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', backgroundColor: 'rgba(6,8,14,0.78)' },
  floatText: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  analyzeBtn: { marginTop: 16, alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 12, backgroundColor: colors.gold },
  analyzeText: { color: '#05060a', fontSize: 15, fontWeight: '700' },
  error: { color: '#f87171', marginTop: 12, fontSize: 13 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(52,211,153,0.14)', backgroundColor: 'rgba(52,211,153,0.06)' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  liveText: { color: '#6ee7b7', fontSize: 11 },
  empty: { color: colors.textFaint, fontSize: 13, marginTop: 8 },
  pet: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', backgroundColor: 'rgba(255,255,255,0.025)' },
  petPrimary: { borderColor: 'rgba(209,179,109,0.2)', backgroundColor: 'rgba(195,163,95,0.07)' },
  petLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 14 },
  match: { color: colors.goldLight, fontSize: 11 },
  petValue: { color: '#fff', fontSize: 30, fontWeight: '600', marginVertical: 8 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.055)', overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 3 },
  digitBox: { marginTop: 16, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.wineBorder, backgroundColor: colors.wineBg, alignItems: 'stretch' },
  digitLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  digitValue: { color: colors.wineLight, fontSize: 96, fontWeight: '700', textAlign: 'center', marginVertical: 8 },
  digitPct: { color: colors.goldLight, fontSize: 14, fontWeight: '600' },
});