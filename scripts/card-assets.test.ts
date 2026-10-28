import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  catalogManifestSchema,
  developmentCatalog,
} from '../packages/card-domain/src';
import {
  renderCardBackSvg,
  renderCardFaceSvg,
} from '../packages/ui/src/card-art';
describe('exported catalog artifacts', () => {
  it('matches the bundled manifest, source vectors and every exported content hash', () => {
    const json: unknown = JSON.parse(
      readFileSync(
        new URL('../assets/foundation/manifest.json', import.meta.url),
        'utf8',
      ),
    );
    const manifest = catalogManifestSchema.parse(json);
    expect(manifest).toEqual(developmentCatalog);
    for (const asset of manifest.assets) {
      const contents = readFileSync(
        new URL('../assets/' + asset.key, import.meta.url),
        'utf8',
      );
      expect(createHash('sha256').update(contents).digest('hex')).toBe(
        asset.sha256,
      );
      expect(contents).toBe(
        (asset.kind === 'FRONT'
          ? renderCardFaceSvg(asset.faceId!)
          : renderCardBackSvg()) + '\n',
      );
    }
  });
});
