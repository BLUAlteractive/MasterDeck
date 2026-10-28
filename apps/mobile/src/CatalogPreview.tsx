import { StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { canonicalFaces, suits } from '@deckforge/game-core';
import {
  catalogManifestSchema,
  developmentCatalog,
} from '@deckforge/card-domain';
import {
  renderCardBackSvg,
  renderCardFaceSvg,
  shellTheme,
} from '@deckforge/ui';

const catalog = catalogManifestSchema.parse(developmentCatalog);
const names = {
  CLUBS: 'Clubs',
  DIAMONDS: 'Diamonds',
  HEARTS: 'Hearts',
  SPADES: 'Spades',
} as const;
export function CatalogPreview() {
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>CATALOG PREVIEW</Text>
      <Text accessibilityRole="header" style={styles.heading}>
        {catalog.displayName}
      </Text>
      <Text style={styles.note}>52 faces · Draft artwork</Text>
      <Text style={styles.note}>
        Preview edition. Collection ownership comes later.
      </Text>
      <View style={styles.backRow}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel="Original blue geometric card back"
        >
          <SvgXml xml={renderCardBackSvg()} width={96} height={134.4} />
        </View>
        <View style={styles.backText}>
          <Text style={styles.backTitle}>Blue standard back</Text>
          <Text style={styles.note}>
            A simple, symmetric blue weave for the first edition.
          </Text>
        </View>
      </View>
      {suits.map((suit) => (
        <View key={suit} style={styles.suit}>
          <Text accessibilityRole="header" style={styles.suitTitle}>
            {names[suit]} · 13 faces
          </Text>
          <View style={styles.grid}>
            {canonicalFaces
              .filter((face) => face.suit === suit)
              .map((face) => (
                <View
                  key={face.id}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={face.label}
                  style={styles.card}
                >
                  <SvgXml
                    xml={renderCardFaceSvg(face.id)}
                    width={112}
                    height={156.8}
                  />
                  <Text style={styles.caption}>
                    {face.rankLabel} · {names[suit]}
                  </Text>
                </View>
              ))}
          </View>
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  section: { width: '100%', maxWidth: 760, padding: 24, gap: 14 },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
    color: shellTheme.accent,
  },
  heading: { fontSize: 30, fontWeight: '700', color: shellTheme.text },
  note: { color: shellTheme.muted, fontSize: 15, lineHeight: 23 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 18,
  },
  backText: { flex: 1, gap: 8 },
  backTitle: { color: shellTheme.text, fontSize: 18, fontWeight: '600' },
  suit: { gap: 16, marginTop: 18 },
  suitTitle: { fontSize: 21, color: shellTheme.text, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: { width: 112, gap: 7 },
  caption: { color: shellTheme.muted, fontSize: 13, textAlign: 'center' },
});
