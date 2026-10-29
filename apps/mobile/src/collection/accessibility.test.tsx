import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { getFace } from '@deckforge/game-core';
import { CardTile } from './CardTile';
import { previewEntries } from './model';
import { Gallery } from './Gallery';
// Native SVG bridge is covered by Expo exports; this SSR test checks semantic controls/labels.
vi.mock('react-native-svg', () => ({
  SvgXml: () => createElement('span', { 'aria-hidden': true }),
}));
describe('gallery accessible semantics', () => {
  it('labels every one of 52 selectable faces with full rank and suit, including draft status', () => {
    for (const entry of previewEntries) {
      const html = renderToStaticMarkup(
        <CardTile entry={entry} width={120} onPress={() => {}} />,
      );
      expect(html).toContain(
        'aria-label="' + getFace(entry.faceId).label + ', draft preview"',
      );
      expect(html).toContain('role="button"');
    }
  });
  it('opens with a real preview and explicit owned-account boundary, not invented inventory', () => {
    const html = renderToStaticMarkup(<Gallery makeId={() => 'unused'} />);
    expect(html).toContain('52 loaded');
    expect(html).toContain('Preview cards are not owned inventory');
    expect(html).toContain('Your collection');
    expect(html).not.toContain('Save 52-face loadout');
  });
});
