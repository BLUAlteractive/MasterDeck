import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

const connectionStrings = new WeakMap<PrismaClient, string>();

/** Server-only factory. Callers own connection lifecycle; never log connection strings. */
export function createDatabase(connectionString: string) {
  const adapter = new PrismaPg({ connectionString });
  const database = new PrismaClient({ adapter, log: [] });
  connectionStrings.set(database, connectionString);
  return database;
}
export { Prisma, PrismaClient } from './generated/client';
export {
  createCardWithOrigin,
  cardSnapshot,
  writeCardTransition,
  InventoryConflict,
} from './inventory';

/** Commit notifications carry only a room UUID. Durable rows remain the source of truth. */
export async function listenGameChanges(
  database: PrismaClient,
  changed: (roomId: string | null) => void,
) {
  const connectionString = connectionStrings.get(database);
  if (!connectionString) throw new Error('Database factory required');
  let closed = false,
    client: Client | null = null,
    timer: ReturnType<typeof setTimeout> | null = null;
  const retry = () => {
    if (closed || timer) return;
    console.warn(
      JSON.stringify({ event: 'game.notifications', status: 'reconnecting' }),
    );
    timer = setTimeout(() => {
      timer = null;
      void connect().catch(retry);
    }, 1000);
    timer.unref();
  };
  const connect = async () => {
    if (closed) return;
    const next = new Client({
      connectionString,
      connectionTimeoutMillis: 5000,
      application_name: 'deckforge_game_notifications',
    });
    client = next;
    let failed = false;
    const lost = () => {
      if (failed) return;
      failed = true;
      void next.end().catch(() => {});
      retry();
    };
    next.on('error', lost);
    next.on('end', () => {
      if (!closed) lost();
    });
    next.on('notification', (event) => {
      if (
        !closed &&
        event.channel === 'deckforge_game_updates' &&
        event.payload &&
        /^[0-9a-f-]{36}$/.test(event.payload)
      )
        changed(event.payload);
    });
    try {
      await next.connect();
      await next.query('LISTEN deckforge_game_updates');
      if (!closed) changed(null);
    } catch {
      lost();
      throw new Error('Notification connection unavailable');
    }
  };
  const close = async () => {
    closed = true;
    if (timer) clearTimeout(timer);
    await client?.end().catch(() => {});
  };
  try {
    await connect();
  } catch {
    await close();
    throw new Error('Notification connection unavailable');
  }
  return close;
}
