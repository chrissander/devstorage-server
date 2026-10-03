import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
let failed = false;
for (const folder of ['src/', 'scripts/']) {
  for (const entry of await readdir(new URL(folder, root), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`${folder}${entry.name}`, root))], { stdio: 'inherit' });
    if (result.error || result.status !== 0) failed = true;
  }
}
if (failed) process.exitCode = 1;
else console.log('JavaScript-Syntax gültig.');
