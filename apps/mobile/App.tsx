import { CollectionApp } from './src/CollectionApp';
import { ManagedSessionHost } from './src/session/ManagedSessionHost';
import { sessionConfiguration } from './src/session/storage';
export { CollectionApp } from './src/CollectionApp';
export default function App() {
  let config;
  try {
    config = sessionConfiguration(
      process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
  } catch {
    return <CollectionApp />;
  }
  return config ? (
    <ManagedSessionHost
      config={config}
      apiUrl={process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'}
    />
  ) : (
    <CollectionApp />
  );
}
