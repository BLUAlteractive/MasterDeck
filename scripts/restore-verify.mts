import {
  createDatabase,
  type PrismaClient,
} from '../packages/database/dist/index.js';
import { PokerRoomService } from '../services/api/src/rooms/service.js';
import { SpadesRoomService } from '../services/api/src/rooms/spades.js';
import { allocatePokerPots } from '../packages/game-poker/src/pots.js';
import { hash } from '../services/api/src/rooms/shared.js';
const sourceUrl = new URL(process.env.DATABASE_URL ?? 'http://missing.invalid');
const restoredUrl = new URL(
  process.env.DECKFORGE_RESTORED_URL ?? 'http://missing.invalid',
);
if (
  sourceUrl.protocol !== 'postgresql:' ||
  sourceUrl.hostname !== '127.0.0.1' ||
  !/^\/deckforge_test_[a-f0-9]{16}$/.test(sourceUrl.pathname) ||
  sourceUrl.pathname !== '/' + process.env.DECKFORGE_DISPOSABLE_DB ||
  restoredUrl.protocol !== sourceUrl.protocol ||
  restoredUrl.origin !== sourceUrl.origin ||
  restoredUrl.username !== sourceUrl.username ||
  restoredUrl.password !== sourceUrl.password ||
  !/^\/deckforge_restore_[a-f0-9]{16}$/.test(restoredUrl.pathname) ||
  restoredUrl.host !== sourceUrl.host
)
  throw new Error('Owned recovery pair required');
const source = createDatabase(sourceUrl.href),
  restored = createDatabase(restoredUrl.href);
async function contents(db: PrismaClient) {
  const tables = await db.$queryRaw<
    { name: string }[]
  >`SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const rows = [];
  for (const { name } of tables) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
      throw new Error('Unexpected table identifier');
    const [r] = await db.$queryRawUnsafe<{ count: string; digest: string }[]>(
      `SELECT count(*)::text AS count,encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') AS digest FROM "${name}" t`,
    );
    rows.push({ name, ...r });
  }
  return rows;
}
async function integrity(db: PrismaClient) {
  const [chips] = await db.$queryRaw<
    { mismatches: number; total: string }[]
  >`SELECT count(*) FILTER(WHERE a.balance<>(SELECT COALESCE(sum(e.amount),0) FROM "PlayChipEntry" e WHERE e."accountId"=a.id))::int AS mismatches,COALESCE(sum(balance),0)::text AS total FROM "PlayChipAccount" a`;
  const [restricted] = await db.$queryRaw<
    { mismatches: number }[]
  >`SELECT count(*)::int AS mismatches FROM "RestrictedAccount" a WHERE a.balance<>(SELECT COALESCE(sum(e.amount),0) FROM "RestrictedEntry" e WHERE e."accountId"=a.id)`;
  const [origins] = await db.$queryRaw<
    { missing: number }[]
  >`SELECT count(*)::int AS missing FROM "CardInstance" c LEFT JOIN "OwnershipEvent" e ON e.id=c."originEventId" AND e."instanceId"=c.id WHERE e.id IS NULL`;
  if (
    chips?.mismatches !== 0 ||
    chips.total !== '0' ||
    restricted?.mismatches !== 0 ||
    origins?.missing !== 0
  )
    throw new Error('Restored inventory or wallet integrity failed');
  return {
    playChipMismatches: chips.mismatches,
    playChipTotal: chips.total,
    restrictedMismatches: restricted.mismatches,
    missingOrigins: origins.missing,
  };
}
async function replay(db: PrismaClient) {
  const poker = new PokerRoomService(db),
    spades = new SpadesRoomService(db),
    outcomes = [];
  const pokerRooms = await db.gameRoom.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    }),
    spadesRooms = await db.spadesRoom.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
  let settledPoker = 0,
    settledSpades = 0;
  for (const room of pokerRooms) {
    const state = await db.$transaction(
      (tx) => poker.trustedState(tx, room.id),
      { timeout: 30000 },
    );
    const result = await db.gameResult.findUnique({
      where: { roomId: room.id },
    });
    if (result) {
      if (
        hash(result.allocation) !== hash(allocatePokerPots(state)) ||
        result.stateVersion !== state.stateVersion
      )
        throw new Error('Poker outcome changed');
      settledPoker++;
    }
    outcomes.push({ game: 'POKER', id: room.id, state: hash(state) });
  }
  for (const room of spadesRooms) {
    const state = await db.$transaction(
      (tx) => spades.trustedState(tx, room.id),
      { timeout: 30000 },
    );
    const result = await db.spadesResult.findUnique({
      where: { roomId: room.id },
    });
    if (result) {
      if (
        result.winner !== state.winner ||
        hash(result.teams) !== hash(state.teams) ||
        result.stateVersion !== state.stateVersion
      )
        throw new Error('Spades outcome changed');
      settledSpades++;
    }
    outcomes.push({ game: 'SPADES', id: room.id, state: hash(state) });
  }
  if (!settledPoker || !settledSpades)
    throw new Error('No settled game evidence');
  return {
    pokerRooms: pokerRooms.length,
    spadesRooms: spadesRooms.length,
    settledPoker,
    settledSpades,
    digest: hash(outcomes),
  };
}
let stage = 'contents';
try {
  const before = await contents(source),
    after = await contents(restored);
  if (hash(before) !== hash(after))
    throw new Error('Restored table contents differ');
  stage = 'replay';
  const originalReplay = await replay(source),
    restoredReplay = await replay(restored);
  if (hash(originalReplay) !== hash(restoredReplay))
    throw new Error('Replay differs');
  stage = 'integrity';
  const invariants = await integrity(restored);
  process.stdout.write(
    JSON.stringify({
      event: 'recovery.verify',
      status: 'ok',
      tables: after.length,
      rows: after.reduce((n, r) => n + Number(r.count), 0),
      contentsDigest: hash(after),
      replay: restoredReplay,
      integrity: invariants,
    }) + '\n',
  );
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  const allowed = [
    'Restored table contents differ',
    'Poker outcome changed',
    'Spades outcome changed',
    'Replay differs',
    'No settled game evidence',
    'Restored inventory or wallet integrity failed',
    'ROOM_INTEGRITY',
    'SPADES_INTEGRITY',
    'SPADES_REPLAY_INTEGRITY',
  ];
  console.error(
    JSON.stringify({
      event: 'recovery.verify',
      status: 'failed',
      stage,
      code: allowed.includes(message) ? message : 'INTERNAL_ERROR',
    }),
  );
  process.exitCode = 1;
} finally {
  await source.$disconnect();
  await restored.$disconnect();
}
