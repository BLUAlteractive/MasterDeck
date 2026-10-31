import type { identityFixture } from './auth-fixture';
import type { Capability } from '../src/admin/access';
/** Owned-test operator bootstrap; never imported by application modules. */
export async function fixtureAdmin(
  f: Awaited<ReturnType<typeof identityFixture>>,
  capabilities: Capability[],
) {
  const actor = await f.actor(false, 'aal2');
  await f.db.user.update({
    where: { id: actor.userId },
    data: { role: 'ADMIN' },
  });
  await f.db.adminCapability.createMany({
    data: capabilities.map((capability) => ({
      userId: actor.userId,
      capability,
      grantedBy: 'test.operator-provisioning-only',
    })),
  });
  return actor;
}
