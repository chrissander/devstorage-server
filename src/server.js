// Vercel detects the Fastify import in this server entrypoint.
import Fastify from 'fastify';
import { buildApp } from './http-app.js';
import { storageConfig, serverConfig } from './config.js';
import { Storage } from './storage.js';

let app;
let storage;
try {
  const listen = serverConfig();
  storage = new Storage(storageConfig());
  app = await buildApp(storage, { createFastify: Fastify });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      app.close().catch(() => { process.exitCode = 1; });
    });
  }
  await app.listen(listen);
} catch {
  // SDK/configuration errors may include endpoint or credential information.
  console.error('API konnte nicht gestartet werden. Konfiguration, Abhängigkeiten und Port prüfen.');
  if (app) await app.close();
  else storage?.close();
  process.exitCode = 1;
}
