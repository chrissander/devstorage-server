// Vercel detects the Fastify import in this server entrypoint.
import Fastify from 'fastify';
import { buildApp } from './http-app.js';
import { storageConfig, serverConfig } from './config.js';
import { Storage } from './storage.js';

let app;
let storage;
async function startupFailed() {
  // SDK/configuration errors may include endpoint or credential information.
  console.error('API konnte nicht gestartet werden. Konfiguration, Abhängigkeiten und Port prüfen.');
  process.exitCode = 1;
  try {
    if (app) await app.close();
    else storage?.close();
  } catch { /* Preserve the failure exit code without exposing provider errors. */ }
}

try {
  const listen = serverConfig();
  storage = new Storage(storageConfig());
  app = await buildApp(storage, { createFastify: Fastify });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      app.close().catch(() => { process.exitCode = 1; });
    });
  }
  // Vercel intercepts listen() while importing this module and starts the
  // captured server afterwards. Awaiting it here would deadlock that import.
  app.listen(listen).catch(startupFailed);
} catch {
  await startupFailed();
}
