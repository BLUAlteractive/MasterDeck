import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Action } from '../collection/controls';
import { useFeedback } from './Feedback';
it('retains explicit disabled semantics and a conservative motion default outside the session host', () => {
  const html = renderToStaticMarkup(
    <Action label="Confirm reviewed choice" disabled onPress={() => {}} />,
  );
  expect(html).toContain('aria-label="Confirm reviewed choice"');
  expect(html).toContain('aria-disabled="true"');
  function Probe() {
    return <span>{String(useFeedback().reduceMotion)}</span>;
  }
  expect(renderToStaticMarkup(<Probe />)).toContain('true');
});
