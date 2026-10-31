import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackProvider, useFeedback } from './Feedback';
import { GettingStarted } from './GettingStarted';
function Probe() {
  const f = useFeedback();
  return (
    <span>
      {String(f.sound)}:{String(f.haptics)}
    </span>
  );
}
it('starts optional feedback muted and renders preview guidance without native audio initialization', () => {
  expect(
    renderToStaticMarkup(
      <FeedbackProvider>
        <Probe />
        <GettingStarted connected={false} />
      </FeedbackProvider>,
    ),
  ).toContain('false:false');
});
it('distinguishes a connected collection from the artwork preview in onboarding labels', () => {
  const connected = renderToStaticMarkup(<GettingStarted connected />),
    preview = renderToStaticMarkup(<GettingStarted connected={false} />);
  expect(connected).toContain('your collection');
  expect(preview).toContain('artwork preview');
  expect(preview).toContain('Getting started and feedback settings');
});
