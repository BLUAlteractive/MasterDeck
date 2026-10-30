import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { Archive } from './Archive';
describe('private archive preview boundary', () => {
  it('does not present draft artwork as discovered, owned or achieved', () => {
    const html = renderToStaticMarkup(<Archive client={null} />);
    expect(html).toContain('Connect your account');
    expect(html).toContain(
      'Artwork previews do not create ownership or discovery records',
    );
    expect(html).not.toContain('Complete series owned now');
    expect(html).not.toContain('Recorded card instances');
    expect(html).not.toContain('Edition serial');
  });
});
