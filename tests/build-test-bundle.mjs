/* =====================================================================
   Собирает игровую логику (TS, ESM) в один IIFE для регресс-харнеса.
   Харнес грузит результат в vm-контекст и гоняет сидированные симуляции.
   Запуск:  node tests/build-test-bundle.mjs   (вызывается из `npm test`)
   ===================================================================== */

import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [path.join(__dirname, 'test-entry.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  outfile: path.join(__dirname, '.bundle.cjs'),
  legalComments: 'none',
  logLevel: 'warning',
});

console.log('✓ тест-бандл собран: tests/.bundle.cjs');
