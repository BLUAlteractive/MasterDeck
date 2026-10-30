import { View, Text, StyleSheet } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  renderCardFaceSvg,
  renderCardBackSvg,
  shellTheme,
} from '@deckforge/ui';
import type { GalleryEntry } from './model';
export function CardArt({
  entry,
  back = false,
  width = 120,
}: {
  entry: GalleryEntry;
  back?: boolean;
  width?: number;
}) {
  if (back && entry.owned)
    return (
      <View
        style={[
          styles.back,
          {
            width,
            height: width * 1.4,
            backgroundColor:
              entry.owned.branch === 'RED' ? '#7b272e' : '#173c68',
          },
        ]}
      >
        <View style={styles.inset}>
          <Text style={styles.word}>{entry.owned.branch}</Text>
          <Text style={styles.note}>Back reference</Text>
        </View>
      </View>
    );
  return (
    <SvgXml
      xml={back ? renderCardBackSvg() : renderCardFaceSvg(entry.faceId)}
      width={width}
      height={width * 1.4}
    />
  );
}
const styles = StyleSheet.create({
  back: { borderRadius: 8, padding: 9, borderWidth: 3, borderColor: '#f4eee2' },
  inset: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d6dfe9',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  word: { color: shellTheme.text, fontSize: 20, fontWeight: '700' },
  note: { color: shellTheme.text, fontSize: 12 },
});
