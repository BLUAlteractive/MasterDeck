import 'dotenv/config';
import { z } from 'zod';
const config = z
  .object({
    JOBS_HEARTBEAT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(60000)
      .default(30000),
  })
  .safeParse(process.env);
if (!config.success) {
  console.error('Invalid jobs configuration. Check JOBS_HEARTBEAT_MS.');
  process.exitCode = 1;
} else {
  console.info('DeckForge jobs shell ready; no queues registered.');
  const timer = setInterval(
    () => console.info('Jobs shell alive.'),
    config.data.JOBS_HEARTBEAT_MS,
  );
  const stop = () => {
    clearInterval(timer);
    console.info('Jobs shell stopped.');
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
