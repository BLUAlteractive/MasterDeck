import { useRef, useEffect } from 'react';
import { Animated } from 'react-native';
import { useFeedback } from '../experience/Feedback';
import { Pressable, StyleSheet, Text } from 'react-native';
import { getFace } from '@deckforge/game-core';
import { shellTheme } from '@deckforge/ui';
import { CardArt } from './CardArt';
import type { GalleryEntry } from './model';
export function CardTile({
  entry,
  width,
  onPress,
}: {
  entry: GalleryEntry;
  width: number;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current,
    feedback = useFeedback(),
    reduce = feedback.reduceMotion;
  useEffect(() => {
    if (reduce) {
      scale.stopAnimation();
      scale.setValue(1);
    }
    return () => scale.stopAnimation();
  }, [reduce, scale]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        getFace(entry.faceId).label +
        (entry.owned
          ? ', ' +
            entry.owned.rarity +
            ', level ' +
            entry.owned.level +
            ', ' +
            entry.owned.status
          : ', draft preview') +
        (entry.favorite ? ', favorite' : '')
      }
      onPress={() => {
        feedback.tap();
        if (!reduce) {
          scale.setValue(0.98);
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
        }
        onPress();
      }}
      style={[styles.card, { width }]}
    >
      <Animated.View
        style={{ transform: [{ scale }] }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <CardArt entry={entry} width={width} />
      </Animated.View>
      <Text style={styles.name}>{getFace(entry.faceId).label}</Text>
      <Text style={styles.note}>
        {entry.favorite ? '★ ' : ''}
        {entry.owned
          ? 'Level ' + entry.owned.level + ' · ' + entry.owned.rarity
          : 'Draft preview'}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: { gap: 6 },
  name: {
    fontSize: 15,
    lineHeight: 20,
    color: shellTheme.text,
    fontWeight: '600',
  },
  note: { color: shellTheme.muted, fontSize: 14, lineHeight: 21 },
});
