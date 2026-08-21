import AsyncStorage from '@react-native-async-storage/async-storage';

import { appConfig } from '@/config/appConfig';

const ADMIN_PIN_KEY = '@mighty_cafe_admin_pin';

export async function getAdminPin(): Promise<string> {
  const stored = await AsyncStorage.getItem(ADMIN_PIN_KEY);
  if (stored) return stored;
  return appConfig.adminPin;
}

export async function setAdminPin(pin: string): Promise<void> {
  await AsyncStorage.setItem(ADMIN_PIN_KEY, pin);
}
