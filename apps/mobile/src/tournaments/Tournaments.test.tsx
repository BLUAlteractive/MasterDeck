import { it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  tournamentViewSchema,
  type TournamentView,
} from '@deckforge/contracts';
import { TournamentBoard } from './Tournaments';
import { stageTournamentAction } from './pending';
const id = '00000000-0000-4000-8000-000000000001',
  matchId = '00000000-0000-4000-8000-000000000002';
export const fixtureTournament = (): TournamentView =>
  tournamentViewSchema.parse({
    id,
    name: 'Original free event',
    status: 'REGISTRATION',
    startsAt: '2026-11-01T18:00:00.000Z',
    capacity: 4,
    registered: 2,
    format: 'CLASSIC_HEADS_UP_SINGLE_HAND_V1',
    rulesetVersion: 'CLASSIC_NLHE_V1',
    entryFee: 0,
    handBuyIn: 100,
    prizeTitle: 'November Champion',
    eligibility: 'AVAILABLE',
    ownEntry: null,
    nextAction: 'REGISTER',
    matches: [],
    championSeed: null,
    standings: [],
    reportUntil: null,
  });
it('discloses UTC schedule, eligibility, free entry versus earned hand stake, format and prestige-only prize', () => {
  const html = renderToStaticMarkup(
    <TournamentBoard event={fixtureTournament()} />,
  );
  for (const text of [
    'Scheduled UTC',
    '2026-11-01',
    'Eligibility: AVAILABLE',
    'Register — free tournament entry',
    'reserves 100 earned Play Chips',
    'Higher final stack advances',
    'prestige title',
    'No cash or transferable prize',
  ])
    expect(html).toContain(text);
  expect(html).not.toContain('Report result');
});
it('shows exact next round/attempt, pending opponents and disabled actions while requests are unconfirmed', () => {
  const event = {
    ...fixtureTournament(),
    status: 'RUNNING' as const,
    ownEntry: 1,
    nextAction: 'READY' as const,
    matches: [
      {
        id: matchId,
        round: 1,
        slot: 0,
        attempt: 2,
        leftSeed: 1,
        rightSeed: 2,
        winnerSeed: null,
        status: 'WAITING' as const,
        ownReady: false,
        gameId: null,
      },
    ],
  };
  const html = renderToStaticMarkup(<TournamentBoard event={event} busy />);
  expect(html).toContain('Confirm ready for round 2, hand attempt 2');
  expect(html).toContain('aria-disabled="true"');
  expect(html).toContain('seed 1 vs seed 2');
  const waiting = renderToStaticMarkup(
    <TournamentBoard event={{ ...event, nextAction: 'WAIT_OPPONENT' }} />,
  );
  expect(waiting).toContain('Waiting for your opponent');
  expect(waiting).not.toContain('Confirm ready for round');
});
it('renders archived exact server results with participant-only reporting and closed-window disclosure', () => {
  const event = {
    ...fixtureTournament(),
    status: 'COMPLETED' as const,
    ownEntry: 1,
    nextAction: 'COMPLETE' as const,
    championSeed: 1,
    reportUntil: '2099-01-01T00:00:00.000Z',
    standings: [
      { seed: 1, wins: 2, champion: true },
      { seed: 2, wins: 1, champion: false },
    ],
    matches: [
      {
        id: matchId,
        round: 1,
        slot: 0,
        attempt: 1,
        leftSeed: 1,
        rightSeed: 2,
        winnerSeed: 1,
        status: 'COMPLETE' as const,
        ownReady: true,
        gameId: id,
      },
    ],
  };
  const html = renderToStaticMarkup(<TournamentBoard event={event} />);
  expect(html).toContain('Archived result — champion seed 1');
  expect(html).toContain('Seed 1: 2 wins. Champion.');
  expect(html).toContain('Report result inconsistent for round 2');
  expect(html).toContain('does not automatically change results');
  const outsider = renderToStaticMarkup(
    <TournamentBoard
      event={{
        ...event,
        ownEntry: null,
        matches: event.matches.map((m) => ({ ...m, gameId: null })),
      }}
    />,
  );
  expect(outsider).not.toContain('Report result inconsistent');
  const closed = renderToStaticMarkup(
    <TournamentBoard
      event={{ ...event, reportUntil: '2000-01-01T00:00:00.000Z' }}
    />,
  );
  expect(closed).not.toContain('Report result inconsistent');
});
it('retains the exact action/key across refresh and rejects replacing an ambiguous attempt or report', () => {
  const makeId = vi.fn(() => id),
    intent = {
      action: 'READY' as const,
      tournamentId: id,
      matchId,
      attempt: 1,
    },
    pending = stageTournamentAction(null, intent, makeId);
  expect(stageTournamentAction(pending, { ...intent }, makeId)).toBe(pending);
  expect(makeId).toHaveBeenCalledTimes(1);
  expect(() =>
    stageTournamentAction(pending, { ...intent, attempt: 2 }, makeId),
  ).toThrow('ACTION_PENDING');
  expect(() =>
    stageTournamentAction(
      pending,
      { action: 'REPORT', tournamentId: id, matchId, code: 'COLLUSION' },
      makeId,
    ),
  ).toThrow('ACTION_PENDING');
});
