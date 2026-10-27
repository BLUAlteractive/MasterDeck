import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { healthResponseSchema } from '@deckforge/contracts';
import { shellTheme } from '@deckforge/ui';

export default function App() {
  const [status, setStatus] = useState('Ready to connect');
  const [busy, setBusy] = useState(false);
  async function checkApi() {
    setBusy(true);
    try {
      const base = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';
      const response = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('API unavailable');
      healthResponseSchema.parse(await response.json());
      setStatus('API connected');
    } catch {
      setStatus('Could not connect. Check the API address and try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.title}>
          DeckForge
        </Text>
        <Text style={styles.subtitle}>Your collection starts here.</Text>
        <Text style={styles.body}>Development shell · B001</Text>
        <Text style={styles.body}>
          The workspace is ready for the first collection milestone.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => void checkApi()}
          style={styles.button}
        >
          <Text style={styles.buttonLabel}>
            {busy ? 'Connecting…' : 'Check API connection'}
          </Text>
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          {status}
        </Text>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  button: {
    backgroundColor: shellTheme.accent,
    borderRadius: 8,
    padding: 16,
    minHeight: 48,
  },
  buttonLabel: {
    color: shellTheme.background,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
  },
  page: {
    flexGrow: 1,
    backgroundColor: shellTheme.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 520,
    padding: 28,
    borderRadius: 20,
    backgroundColor: shellTheme.surface,
    gap: 20,
  },
  title: { fontSize: 40, fontWeight: '700', color: shellTheme.text },
  subtitle: { fontSize: 22, color: shellTheme.accent },
  body: { fontSize: 17, lineHeight: 26, color: shellTheme.muted },
});
