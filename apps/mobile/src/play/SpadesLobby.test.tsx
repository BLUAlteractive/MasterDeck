import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { lobbyCommandSchema, spadesStartSchema } from '@deckforge/contracts';
import { SpadesLobby } from './SpadesLobby';
it('does not invent a policy or session and provides labeled private invite controls', () => {
  const html = renderToStaticMarkup(
    <SpadesLobby client={null} makeId={() => 'unused'} />,
  );
  expect(html).toContain('Connect your account');
  expect(html).toContain('Spades rules are awaiting publication');
  expect(html).toContain('Spades private invite');
  expect(html).toContain('aria-disabled="true"');
  expect(html).not.toContain('name="token"');
});
it('safe messages and rematches accept only declarative identifiers, never text or scores', () => {
  const gameId = '00000000-0000-4000-8000-000000000001';
  expect(
    lobbyCommandSchema.safeParse({
      action: 'SAY',
      commandId: 'stable-message-0001',
      code: 'HELLO',
    }).success,
  ).toBe(true);
  expect(
    lobbyCommandSchema.safeParse({
      action: 'SAY',
      commandId: 'stable-message-0001',
      code: 'HELLO',
      text: 'strategy',
    }).success,
  ).toBe(false);
  expect(
    spadesStartSchema.safeParse({
      lobbyId: gameId,
      commandId: 'stable-start-0001',
      rematchOf: gameId,
    }).success,
  ).toBe(true);
  expect(
    spadesStartSchema.safeParse({
      lobbyId: gameId,
      commandId: 'stable-start-0001',
      scores: [999, 0],
    }).success,
  ).toBe(false);
});
