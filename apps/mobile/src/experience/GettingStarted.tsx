import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { shellTheme } from '@deckforge/ui';
import { Action } from '../collection/controls';
import { useFeedback } from './Feedback';
export function GettingStarted({ connected }: { connected: boolean }) {
  const [open, setOpen] = useState(false),
    feedback = useFeedback();
  return (
    <View style={{ padding: 12, gap: 8 }}>
      <Text
        accessibilityRole="header"
        style={{ color: shellTheme.accent, fontSize: 23 }}
      >
        DeckForge · {connected ? 'your collection' : 'artwork preview'}
      </Text>
      <Action
        label={
          open
            ? 'Close getting started and feedback settings'
            : 'Getting started and feedback settings'
        }
        selected={open}
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <ScrollView
          style={{ maxHeight: 260 }}
          contentContainerStyle={{ gap: 8 }}
        >
          <Text
            style={{ color: shellTheme.text, fontSize: 16, lineHeight: 24 }}
          >
            Explore original card art first. A configured guest account receives
            one starter deck. Keep guest access safe: account linking is
            unavailable in this build. Choose one owned card per face for your
            52-card loadout, then select Classic or Spades when play is
            available. Fusion requires a reviewed preview and confirmation.
            Activity permissions are optional; nonwalking quests are a separate
            path. Paid cosmetics never add power. Live billing and tournament
            entry require reviewed availability.
          </Text>
          <Action
            label={'Tap sound: ' + (feedback.sound ? 'on' : 'off')}
            selected={feedback.sound}
            onPress={() => feedback.setSound(!feedback.sound)}
          />
          <Action
            label={'Tap haptics: ' + (feedback.haptics ? 'on' : 'off')}
            selected={feedback.haptics}
            onPress={() => feedback.setHaptics(!feedback.haptics)}
          />
          <Text style={{ color: shellTheme.muted }}>
            Optional feedback is off by default, stays in this session, and
            stops when the app leaves the foreground. System reduced motion is
            respected. Sound or vibration never communicates a result by itself.
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}
