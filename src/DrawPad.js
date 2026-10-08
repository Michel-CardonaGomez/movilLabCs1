import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View, Text, PanResponder, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { colors } from './theme';

// Lienzo para dibujar un dígito. Fondo negro y trazo blanco, como MNIST.
const DrawPad = forwardRef(function DrawPad({ onChange, onDrawingActive }, ref) {
  const [paths, setPaths] = useState([]); // lista de trazos (strings SVG)
  const [current, setCurrent] = useState('');
  const viewRef = useRef(null);
  const currentRef = useRef('');
  const activeRef = useRef(onDrawingActive);
  activeRef.current = onDrawingActive;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      // Evita que el ScrollView de la pantalla le quite el gesto al lienzo
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        activeRef.current?.(true); // bloquea el scroll mientras se dibuja
        const { locationX: x, locationY: y } = e.nativeEvent;
        currentRef.current = `M${x.toFixed(1)},${y.toFixed(1)} L${x.toFixed(1)},${y.toFixed(1)}`;
        setCurrent(currentRef.current);
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        currentRef.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
        setCurrent(currentRef.current);
      },
      onPanResponderTerminate: () => {
        activeRef.current?.(false);
      },
      onPanResponderRelease: () => {
        activeRef.current?.(false); // vuelve a permitir el scroll
        const finished = currentRef.current;
        currentRef.current = '';
        setCurrent('');
        setPaths((p) => [...p, finished]);
        onChange?.(true);
      },
    })
  ).current;

  const clear = () => {
    setPaths([]);
    setCurrent('');
    currentRef.current = '';
    onChange?.(false);
  };

  // Permite que App.js pida la imagen del dibujo y limpie el lienzo
  useImperativeHandle(ref, () => ({
    clear,
    capture: () => captureRef(viewRef, { format: 'jpg', quality: 1, result: 'tmpfile' }),
  }));

  const empty = paths.length === 0 && !current;

  return (
    <View style={s.wrap}>
      <View ref={viewRef} collapsable={false} style={s.canvas} {...pan.panHandlers}>
        <Svg width="100%" height="100%">
          {[...paths, current].filter(Boolean).map((d, i) => (
            <Path
              key={i}
              d={d}
              stroke="#ffffff"
              strokeWidth={20}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
      </View>

      {empty && (
        <View style={s.hint} pointerEvents="none">
          <Text style={s.hintDigit}>7</Text>
          <Text style={s.hintText}>Dibuja un número del 0 al 9</Text>
        </View>
      )}

      <TouchableOpacity style={s.clear} onPress={clear}>
        <Text style={s.clearText}>Limpiar</Text>
      </TouchableOpacity>
    </View>
  );
});

export default DrawPad;

const s = StyleSheet.create({
  wrap: { width: '100%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.wineBorder },
  canvas: { flex: 1, backgroundColor: colors.canvas },
  hint: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  hintDigit: { fontSize: 120, fontWeight: '700', color: 'rgba(147,65,87,0.13)' },
  hintText: { color: colors.textFaint, fontSize: 13, marginTop: -4 },
  clear: {
    position: 'absolute', right: 12, bottom: 12, paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', backgroundColor: 'rgba(6,8,14,0.78)',
  },
  clearText: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
});