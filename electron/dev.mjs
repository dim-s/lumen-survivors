/* =====================================================================
   Electron dev-цикл: поднимает Vite dev-сервер и запускает Electron,
   указывающий на него (VITE_DEV_SERVER_URL). Без доп. зависимостей.
   Запуск: npm run electron:dev
   ===================================================================== */

import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls?.local?.[0];
if (!url) { console.error('Не удалось получить URL Vite dev-сервера'); process.exit(1); }
console.log('Vite dev: ' + url + '  →  запускаю Electron');

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});
child.on('close', () => { server.close().then(() => process.exit(0)); });
