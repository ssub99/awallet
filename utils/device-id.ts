import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';

function generateUuidV4(): string {
  // RFC4122 version 4 UUID using crypto.getRandomValues
  // react-native-get-random-values polyfills crypto.getRandomValues
  const bytes = new Uint8Array(16);
  (globalThis.crypto as Crypto).getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  const b = Array.from(bytes, toHex);
  return `${b[0]}${b[1]}${b[2]}${b[3]}-${b[4]}${b[5]}-${b[6]}${b[7]}-${b[8]}${b[9]}-${b[10]}${b[11]}${b[12]}${b[13]}${b[14]}${b[15]}`;
}

const STORAGE_KEY = 'device_id';

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = generateUuidV4();
    await AsyncStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // Fallback to volatile id
    return generateUuidV4();
  }
}


