import { lstat, readdir, readFile, mkdir, mkdtemp, writeFile, rename, rm, open } from 'node:fs/promises';
import { resolve, parse, relative, dirname, basename, join, sep } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { filename, checkPaths } from './model.js';
import { BODY_LIMIT, decodeBase64 } from './files.js';

async function stat(path) {
  try { return await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function noSymlinkParents(path) {
  let current = parse(path).root;
  for (const segment of relative(current, path).split(sep).filter(Boolean)) {
    current = join(current, segment);
    if ((await stat(current))?.isSymbolicLink()) throw new Error(`Symbolischer Link ist nicht zulässig: ${current}`);
  }
}

async function walk(root, prefix = '', validateNames = true) {
  const files = [];
  for (const item of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isSymbolicLink() || (!item.isDirectory() && !item.isFile())) throw new Error(`Kein regulärer Datei-/Ordnereintrag: ${path}`);
    if (validateNames) filename(path);
    if (item.isDirectory()) files.push(...await walk(root, path, validateNames));
    else files.push(path);
  }
  return files.sort();
}

export async function readLocalFile(path) {
  const absolute = resolve(path);
  await noSymlinkParents(absolute);
  const info = await stat(absolute);
  if (!info?.isFile()) throw new Error(`Lokale Datei fehlt oder ist nicht regulär: ${absolute}`);
  if (info.size > BODY_LIMIT) throw new Error('Datei überschreitet das Requestlimit von 16 MiB.');
  return readFile(absolute);
}

export function encodePayload(value) {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > BODY_LIMIT) throw new Error('Kodiertes Upload-Paket überschreitet das Requestlimit von 16 MiB.');
  return encoded;
}

export async function collectSnapshot(path) {
  const root = resolve(path);
  await noSymlinkParents(root);
  if (!(await stat(root))?.isDirectory()) throw new Error(`Lokaler Projektordner fehlt: ${root}`);
  const names = await walk(root);
  const files = [];
  let size = Buffer.byteLength('{"files":[]}');
  for (const name of names) {
    const bytes = await readLocalFile(join(root, name));
    const file = { filename: name, dataBase64: bytes.toString('base64') };
    size += Buffer.byteLength(JSON.stringify(file)) + (files.length ? 1 : 0);
    if (size > BODY_LIMIT) throw new Error('Kodiertes Push-Paket überschreitet das Requestlimit von 16 MiB.');
    files.push(file);
  }
  return { files };
}

export async function replaceLocalSnapshot(path, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.files)) throw new Error('Ungültige Snapshot-Antwort.');
  checkPaths(snapshot.files.map(file => file.filename));
  const files = snapshot.files.map(file => ({ filename: file.filename, bytes: decodeBase64(file.dataBase64) }));
  const target = resolve(path);
  const cwd = resolve(process.cwd());
  if (target === parse(target).root || target === resolve(homedir()) || cwd === target || cwd.startsWith(`${target}${sep}`)) {
    throw new Error('Pull benötigt einen eigenen Projektordner, nicht das Arbeitsverzeichnis oder dessen Eltern.');
  }
  await noSymlinkParents(target);
  const existing = await stat(target);
  if (existing && !existing.isDirectory()) throw new Error('Pull-Ziel ist kein regulärer Ordner.');
  if (existing) await walk(target, '', false);
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const lockPath = join(parent, `.${basename(target)}.dev-storage-pull.lock`);
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Pull-Sperre vorhanden: ${lockPath}. Laufenden Pull oder verbliebene Sicherung prüfen.`);
    throw error;
  }
  let stage;
  let backup;
  try {
    stage = await mkdtemp(join(parent, `.${basename(target)}-pull-`));
    for (const file of files) {
      const destination = join(stage, file.filename);
      await mkdir(dirname(destination), { recursive: true });
      // Exclusive creation also rejects case collisions on case-insensitive disks.
      await writeFile(destination, file.bytes, { flag: 'wx' });
    }
    await noSymlinkParents(target);
    const current = await stat(target);
    if (current && !current.isDirectory()) throw new Error('Pull-Ziel ist inzwischen kein regulärer Ordner mehr.');
    if (current) {
      backup = join(parent, `.${basename(target)}-backup-${randomUUID()}`);
      await rename(target, backup);
    }
    try { await rename(stage, target); stage = undefined; }
    catch (error) {
      if (backup) {
        try {
          if (await stat(target)) throw new Error('Ziel wurde zwischenzeitlich angelegt.');
          await rename(backup, target);
          backup = undefined;
        } catch { throw new Error(`Ordneraustausch fehlgeschlagen. Bisheriger Bestand liegt in ${backup}.`); }
      }
      throw error;
    }
    if (backup) {
      try { await rm(backup, { recursive: true }); }
      catch { throw new Error(`Pull ist veröffentlicht; Sicherungsordner konnte nicht entfernt werden: ${backup}`); }
    }
    return files.length;
  } finally {
    try { if (stage) await rm(stage, { recursive: true, force: true }); }
    finally { await lock.close(); await rm(lockPath, { force: true }); }
  }
}

export async function writeLocalFile(path, bytes) {
  const target = resolve(path);
  await noSymlinkParents(target);
  await mkdir(dirname(target), { recursive: true });
  const folder = await mkdtemp(join(dirname(target), '.dev-storage-read-'));
  try {
    const file = join(folder, 'content');
    await writeFile(file, bytes);
    await rename(file, target);
  } finally { await rm(folder, { recursive: true, force: true }); }
}
