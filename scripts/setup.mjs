import { copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
for (const directory of [
  '',
  'apps/mobile/',
  'apps/admin/',
  'services/api/',
  'services/jobs/',
]) {
  const source = new URL(`${directory}.env.example`, root);
  const destination = new URL(`${directory}.env`, root);
  try {
    await copyFile(source, destination, constants.COPYFILE_EXCL);
    console.info(`Created ${fileURLToPath(destination)}`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.info(`Kept existing ${directory}.env`);
  }
}
