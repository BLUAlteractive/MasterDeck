import { requireOptionalNativeModule } from 'expo';
import { AppState } from 'react-native';
import { healthBridge, type HealthNative } from './bridge';
export const deviceHealth = healthBridge(
  requireOptionalNativeModule<HealthNative>('DeckForgeHealth'),
  () => AppState.currentState === 'active',
);
