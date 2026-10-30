import { Pressable, StyleSheet, Text, View } from 'react-native';
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
      onPress={onPress}
      style={[styles.card, { width }]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <CardArt entry={entry} width={width} />
      </View>
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
