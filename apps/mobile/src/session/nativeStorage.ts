import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { chunkedSecretStore } from './storage';
export { authStorageKey } from './storage';
export const credentialStorage =
  Platform.OS === 'web'
    ? {
        async getItem(key: string) {
          return sessionStorage.getItem(key);
        },
        async setItem(key: string, value: string) {
          sessionStorage.setItem(key, value);
        },
        async removeItem(key: string) {
          sessionStorage.removeItem(key);
        },
      }
    : chunkedSecretStore({
        getItem: (key) => SecureStore.getItemAsync(key),
        setItem: (key, value) =>
          SecureStore.setItemAsync(key, value, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          }),
        removeItem: (key) => SecureStore.deleteItemAsync(key),
      });
