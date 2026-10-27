import 'dotenv/config';
import { createApp } from './app';
import { readConfig } from './config';
async function main() {
  const config = readConfig(process.env);
  const app = await createApp(config.origins);
  await app.listen(config.port, config.host);
}
main().catch(() => {
  console.error(
    'API startup failed. Check local configuration and port availability.',
  );
  process.exitCode = 1;
});
