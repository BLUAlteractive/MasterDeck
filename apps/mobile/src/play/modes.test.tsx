import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { pokerRulesVersions, lobbyResultSchema } from '@deckforge/contracts';
import { PlayLobby } from './PlayLobby';
import { PokerMatchScreen } from './PokerMatchScreen';
import { createCollectionClient } from '../collection/client';
describe('isolated mode selection and labels', () => {
  it('shows standard-only Classic and labels experimental Evolved plus selected rules', () => {
    const classic = renderToStaticMarkup(
      <PokerMatchScreen
        mode="CLASSIC"
        rulesetVersion={pokerRulesVersions.CLASSIC}
      />,
    );
    expect(classic).toContain('Standard poker ranking');
    expect(classic).toContain('never change the winner');
    const evolved = renderToStaticMarkup(
      <PokerMatchScreen
        mode="EVOLVED"
        rulesetVersion={pokerRulesVersions.EVOLVED}
      />,
    );
    expect(evolved).toContain('experimental');
    expect(evolved).toContain(pokerRulesVersions.EVOLVED);
    expect(evolved).toContain('unavailable pending balancing review');
    expect(() =>
      renderToStaticMarkup(
        <PokerMatchScreen
          mode="CLASSIC"
          rulesetVersion={pokerRulesVersions.EVOLVED}
        />,
      ),
    ).toThrow('Mismatched match rules');
  });
  it('does not invent an owned session or enable joining in preview', () => {
    const html = renderToStaticMarkup(
      <PlayLobby client={null} makeId={() => 'unused'} />,
    );
    expect(html).toContain('Connect your account');
    expect(html).toContain('Join selected queue');
    expect(html).toContain('aria-disabled="true"');
  });
  it('sends explicit mode using refreshed bearer and stable supplied command ID, no scoring metadata', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ lobby: null, invite: null }), {
        status: 200,
      }),
    );
    const client = createCollectionClient(
      'https://api.example.invalid',
      async () => 'refreshed-token',
      transport,
    );
    await client.lobbyCommand({
      action: 'QUEUE',
      mode: 'EVOLVED',
      commandId: 'stable-command-001',
    });
    expect(transport.mock.calls[0]![1]!.body).toBe(
      JSON.stringify({
        action: 'QUEUE',
        commandId: 'stable-command-001',
        mode: 'EVOLVED',
      }),
    );
    expect(transport.mock.calls[0]![1]!.headers).toMatchObject({
      Authorization: 'Bearer refreshed-token',
    });
  });
  it('rejects a mismatched or unreviewed enabled lobby response', () => {
    const lobby = {
      id: '00000000-0000-4000-8000-000000000001',
      kind: 'PUBLIC',
      mode: 'EVOLVED',
      rulesetVersion: pokerRulesVersions.CLASSIC,
      status: 'OPEN',
      capacity: 2,
      hostId: '00000000-0000-4000-8000-000000000002',
      version: 1,
      members: [],
      canStart: false,
      admission: 'BALANCE_REVIEW_REQUIRED',
    };
    expect(lobbyResultSchema.safeParse({ lobby, invite: null }).success).toBe(
      false,
    );
    expect(
      lobbyResultSchema.safeParse({
        lobby: {
          ...lobby,
          rulesetVersion: pokerRulesVersions.EVOLVED,
          canStart: true,
        },
        invite: null,
      }).success,
    ).toBe(false);
  });
});
