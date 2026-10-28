import 'dotenv/config';
import { createApp } from './app';
import { createDatabase } from '@deckforge/database';
import { AuthService } from './auth/service';
import { createTokenVerifier } from './auth/token-verifier';
import { readConfig } from './config';
async function main() {
  const config = readConfig(process.env);
  const database = config.databaseUrl
    ? createDatabase(config.databaseUrl)
    : null;
  const auth =
    config.auth && database
      ? new AuthService(database, createTokenVerifier(config.auth))
      : null;
  const app = await createApp(config.origins, auth, database);
  await app.listen(config.port, config.host);
}
main().catch(() => {
  console.error(
    'API startup failed. Check local configuration and port availability.',
  );
  process.exitCode = 1;
});
