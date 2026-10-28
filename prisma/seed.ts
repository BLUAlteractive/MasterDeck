import { createDatabase } from '../packages/database/src';
import { seedFoundation } from '../packages/database/src/seed';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for seeding.');
  const database = createDatabase(url);
  const started = Date.now();
  try {
    await seedFoundation(database);
    console.info(
      JSON.stringify({
        event: 'database.seed',
        status: 'ok',
        durationMs: Date.now() - started,
      }),
    );
  } finally {
    await database.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'Database seed failed; no connection string or row data is logged.',
  );
  process.exitCode = 1;
});
