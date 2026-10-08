import { File } from 'expo-file-system';

const URLS = {
  pets: process.env.EXPO_PUBLIC_CATSDOGS_URL,
  digits: process.env.EXPO_PUBLIC_MNIST_URL,
};

export async function predict(model, uri) {
  const url = URLS[model];
  if (!url) throw new Error('Falta la URL de la API en el archivo .env');

  // El fetch de Expo no acepta el formato { uri, name, type } de React Native.
  // Hay que enviar un File de expo-file-system, que sí es compatible con FormData.
  const form = new FormData();
  form.append('image', new File(uri));

  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`El servidor respondió con el código ${res.status}`);
  return res.json();
}