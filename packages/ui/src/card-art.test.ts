import { describe, expect, it } from 'vitest';
import { canonicalFaces } from '@deckforge/game-core';
import { pipPositions, renderCardBackSvg, renderCardFaceSvg } from './card-art';
describe('original vector faces and blue back', () => {
  it('renders all 52 distinct faces with readable rank/suit titles', () => {
    const rendered = canonicalFaces.map((face) => {
      const svg = renderCardFaceSvg(face.id);
      expect(svg).toContain('<title>' + face.label + '</title>');
      expect(svg).toContain('viewBox="0 0 240 336"');
      expect(svg).not.toMatch(/<script|foreignObject|href=|javascript:/i);
      return svg;
    });
    expect(new Set(rendered).size).toBe(52);
    expect(renderCardBackSvg()).not.toMatch(
      /<script|foreignObject|href=|javascript:/i,
    );
  });
  it('uses the correct number of distinct pips for numbered faces', () => {
    for (let rank = 2; rank <= 10; rank++) {
      const positions = pipPositions(rank);
      expect(positions).toHaveLength(rank);
      expect(new Set(positions.map(([x, y]) => x + ',' + y)).size).toBe(rank);
      for (const [x, y] of positions)
        expect(x > 40 && x < 200 && y > 60 && y < 276).toBe(true);
    }
  });
  it('rejects invalid face values before SVG interpolation', () => {
    expect(() => renderCardFaceSvg('<svg onload="bad">')).toThrow();
  });
});
