import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const schema = fileURLToPath(new URL('prisma/schema.prisma', root));
const migrations = fileURLToPath(new URL('prisma/migrations', root));
if (existsSync(schema) || existsSync(migrations)) {
  console.error(
    'Database files detected. B004 must replace this handoff with pinned Prisma validation, migration deployment to an isolated CI database, and integration tests before this check can pass.',
  );
  process.exitCode = 1;
} else {
  console.info(
    'DEFERRED TO B004: no executable Prisma schema or migrations exist. The architecture/schema.prisma planning draft is not executed. This is not a database-validation pass.',
  );
}
