import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

/** Server-only factory. Callers own connection lifecycle; never log connection strings. */
export function createDatabase(connectionString: string) {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter, log: [] });
}
export { Prisma, PrismaClient } from './generated/client';
export {
  createCardWithOrigin,
  cardSnapshot,
  writeCardTransition,
  InventoryConflict,
} from './inventory';
