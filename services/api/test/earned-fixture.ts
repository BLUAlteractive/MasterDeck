import { randomUUID } from 'node:crypto';
import type { AccessiblePolicy } from '@deckforge/contracts';
import type { Principal } from '../src/auth/service';
import type { identityFixture } from './auth-fixture';
import { AccessibleQuestService } from '../src/accessibility';
import { ProgressionService } from '../src/progression';
import { hash, json } from '../src/rooms/shared';
import { fullHouseFixture } from './progress-fixture';
/** Actual quest completion using replayable fixture game evidence; never a real health proof or runtime faucet. */
export async function earnedFixture(
  f: Awaited<ReturnType<typeof identityFixture>>,
  actor: { userId: string; principal: Principal },
  amount: number,
) {
  const goalId = 'EARNED_TEST:' + randomUUID(),
    eligibility = {
      requirePermanent: false,
      minimumOpponents: 1,
      minimumPlayerCommands: 1,
    },
    policy: AccessiblePolicy = {
      ...eligibility,
      version: 'TEST_ONLY_EARNED_QUEST',
      approvalReference: 'TEST_ONLY_NOT_APPROVAL',
      maxTrailPerDay: 1000000,
      goals: [
        {
          goalId,
          equivalencePlanId: 'TEST_ONLY',
          trailCredits: amount,
          pressRecipeId: 'TEST_ONLY',
        },
      ],
    },
    goal = {
      id: 'EARNED_QUEST',
      kind: 'POKER_COMPLETED',
      target: 1,
      badge: 'Test quest',
      window: 'WEEKLY',
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2040-01-01T00:00:00.000Z',
    };
  await f.db.progressGoal.create({
    data: { id: goalId, definition: json(goal), policyHash: hash(policy) },
  });
  const service = new AccessibleQuestService(f.db, policy),
    { enrollmentId } = await service.start(actor.principal, {
      goalId,
      commandId: randomUUID(),
    }),
    opponent = f.players.find((p) => p.userId !== actor.userId)!;
  await new ProgressionService(f.db, {
    ...eligibility,
    version: 'TEST_ONLY_EARNED_FACTS',
    approvalReference: 'TEST_ONLY',
    goals: [],
  }).ingest(
    'POKER',
    await fullHouseFixture(f.db, [actor.userId, opponent.userId]),
  );
  return service.claim(actor.principal, {
    enrollmentId,
    commandId: randomUUID(),
  });
}
