#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { cliConfig, storageConfig } from './config.js';
import { ApiError } from './errors.js';
import { projectId, filename, fileKind } from './model.js';
import { readLocalFile, writeLocalFile, collectSnapshot, replaceLocalSnapshot, encodePayload } from './local-files.js';

const help = `dev-storage workspace init
dev-storage admin rotate-token
dev-storage projects list
dev-storage projects create <projectId>
dev-storage projects delete <projectId> [--confirm <projectId>]
dev-storage projects rotate-token <projectId>
dev-storage files create <projectId> <dateipfad> <lokale-datei>
dev-storage files read <projectId> <dateipfad> [--output <lokale-datei>]
dev-storage files update <projectId> <dateipfad> <lokale-datei>
dev-storage files delete <projectId> <dateipfad>
dev-storage files set-description <projectId> <dateipfad> <beschreibung>
dev-storage files clear-description <projectId> <dateipfad>
dev-storage projects push <projectId> [--dir <ordner>]
dev-storage projects pull <projectId> [--dir <ordner>]`;

async function request(method, path, { body, bytes, etag } = {}) {
  const config = cliConfig();
  const encoded = body === undefined ? undefined : encodePayload(body);
  let response;
  try {
    response = await fetch(`${config.url}/v1${path}`, {
      method, redirect: 'error',
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(bytes !== undefined ? { 'Content-Type': 'application/octet-stream' } : {}),
        ...(etag ? { 'If-Match': etag } : {}),
      },
      ...(encoded !== undefined || bytes !== undefined ? { body: encoded ?? bytes } : {}),
      signal: AbortSignal.timeout(15 * 60_000),
    });
  } catch { throw new Error('API nicht erreichbar oder Anfrage abgebrochen. Aktuellen Stand vor Wiederholung prüfen.'); }
  if (!response.ok) {
    let data;
    try { data = await response.json(); } catch { /* non-JSON proxy error */ }
    throw new Error(`API-Fehler HTTP ${response.status}: ${data?.error?.code || 'UNKNOWN_ERROR'}`);
  }
  return response;
}

async function api(method, path, body) {
  const response = await request(method, path, { body });
  return response.status === 204 ? undefined : response.json();
}

function revision(response) {
  const etag = response.headers.get('etag');
  if (!etag) throw new Error('API-Antwort enthält keine ETag-Revision.');
  return etag;
}

async function main() {
  const { values, positionals } = parseArgs({
    options: { confirm: { type: 'string' }, help: { type: 'boolean', short: 'h' }, output: { type: 'string' }, dir: { type: 'string' } },
    allowPositionals: true, strict: true,
  });
  if (values.help) { console.log(help); return; }
  const [group, action, id, remoteName, localName] = positionals;
  const command = `${group} ${action}`;
  const commands = new Map([
    ['workspace init', 2], ['admin rotate-token', 2], ['projects list', 2],
    ['projects create', 3], ['projects delete', 3], ['projects rotate-token', 3],
    ['files set-description', 5], ['files clear-description', 4],
    ['files create', 5], ['files read', 4], ['files update', 5], ['files delete', 4],
    ['projects push', 3], ['projects pull', 3],
  ]);
  if (commands.get(command) !== positionals.length || !commands.has(command) ||
      (values.confirm !== undefined && command !== 'projects delete') ||
      (values.output !== undefined && command !== 'files read') ||
      (values.dir !== undefined && !['projects push', 'projects pull'].includes(command))) throw new Error(`Ungültiger Aufruf.\n${help}`);
  if (id !== undefined) projectId(id);

  if (command === 'workspace init') {
    // API wrapper commands do not load the SDK or require S3 configuration.
    const { Storage } = await import('./storage.js');
    const { initializeWorkspace } = await import('./service.js');
    const storage = new Storage(storageConfig());
    try {
      const result = await initializeWorkspace(storage);
      console.log(result.initialized ? JSON.stringify({ adminToken: result.adminToken }, null, 2) : 'Workspace bereits initialisiert.');
    } finally { storage.close(); }
    return;
  }

  if (group === 'files') {
    filename(remoteName);
    const kind = fileKind(remoteName);
    const base = `/projects/${id}/${kind}`;
    const path = `${base}/${encodeURIComponent(remoteName)}`;
    if (action === 'read') {
      const response = await request('GET', path);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (values.output !== undefined) {
        await writeLocalFile(values.output, bytes);
        console.error(`Datei gespeichert: ${values.output}`);
      } else {
        await new Promise((resolve, reject) => process.stdout.write(bytes, error => error ? reject(error) : resolve()));
      }
    } else if (action === 'create') {
      const bytes = await readLocalFile(localName);
      await request('POST', base, { body: { filename: remoteName, dataBase64: bytes.toString('base64') } });
      console.error(`Datei angelegt: ${remoteName}`);
    } else {
      const bytes = action === 'update' ? await readLocalFile(localName) : undefined;
      const listing = await request('GET', base);
      const etag = revision(listing);
      const entries = (await listing.json())[kind];
      if (!entries.some(entry => entry.filename === remoteName)) throw new Error(`Datei nicht gefunden: ${remoteName}`);
      const descriptionChange = action === 'set-description' || action === 'clear-description';
      await request(descriptionChange ? 'PATCH' : action === 'update' ? 'PUT' : 'DELETE', path, {
        bytes, etag, ...(descriptionChange ? { body: { description: action === 'clear-description' ? null : localName } } : {}),
      });
      console.error(`Datei ${action === 'delete' ? 'gelöscht' : 'gespeichert'}: ${remoteName}`);
    }
    return;
  }

  if (command === 'projects push' || command === 'projects pull') {
    const directory = values.dir ?? `projects/${id}`;
    const path = `/projects/${id}/snapshot`;
    if (action === 'push') {
      const snapshot = await collectSnapshot(directory);
      const current = await request('GET', path);
      const etag = revision(current);
      await current.arrayBuffer();
      await request('PUT', path, { body: snapshot, etag });
      console.error(`Push abgeschlossen: ${snapshot.files.length} Dateien aus ${directory}.`);
    } else {
      const current = await request('GET', path);
      const count = await replaceLocalSnapshot(directory, await current.json());
      console.error(`Pull abgeschlossen: ${count} Dateien in ${directory}.`);
    }
    return;
  }

  let result;
  if (command === 'admin rotate-token') result = await api('POST', '/admin/token/rotate');
  if (command === 'projects list') result = await api('GET', '/projects');
  if (command === 'projects create') result = await api('POST', '/projects', { projectId: id });
  if (command === 'projects rotate-token') result = await api('POST', `/projects/${id}/token/rotate`);
  if (command === 'projects delete') {
    let confirmation = values.confirm;
    if (confirmation === undefined) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Nicht interaktiv: --confirm <projectId> ist erforderlich.');
      const input = createInterface({ input: process.stdin, output: process.stdout });
      const controller = new AbortController();
      const cancel = () => { controller.abort(); input.close(); };
      input.once('SIGINT', cancel);
      input.once('close', () => controller.abort());
      try { confirmation = await input.question(`Projekt dauerhaft löschen. Zur Bestätigung "${id}" eingeben: `, { signal: controller.signal }); }
      catch { throw new Error('Löschung abgebrochen.'); }
      finally { input.close(); }
    }
    if (confirmation !== id) throw new Error('Löschung abgebrochen: Projektname stimmt nicht überein.');
    await api('DELETE', `/projects/${id}`, { confirmProject: confirmation });
    console.log('Projekt gelöscht.');
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

try { await main(); }
catch (error) {
  console.error(error instanceof ApiError ? `${error.code}: ${error.message}` : error.message);
  process.exitCode = 1;
}
