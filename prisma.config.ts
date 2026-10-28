import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Generate/validate work without credentials. Mutations fail closed until configured.
    url:
      process.env.DATABASE_URL ??
      'postgresql://unconfigured:unconfigured@127.0.0.1:1/unconfigured',
  },
});
