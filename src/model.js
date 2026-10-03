import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fail, unavailable } from './errors.js';

export const projectPattern = '^[a-z0-9]+(?:-[a-z0-9]+)*$';
export const filenamePattern = '^[A-Za-z0-9][A-Za-z0-9_.-]*(?:/[A-Za-z0-9][A-Za-z0-9_.-]*)*$';
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const isProject = value => typeof value === 'string' && new RegExp(projectPattern).test(value);
export const isFilename = value => typeof value === 'string' && new RegExp(filenamePattern).test(value) && !value.includes('..');
export const newToken = () => randomBytes(32).toString('base64url');

export function sameToken(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function projectId(value) {
  if (!isProject(value)) fail(400, 'INVALID_PROJECT', 'Ungültiger Projektname.');
  return value;
}

export function filename(value) {
  if (!isFilename(value)) fail(400, 'INVALID_FILENAME', 'Ungültiger relativer Dateipfad.');
  return value;
}

export function directoryOf(name) {
  return name.slice(0, name.lastIndexOf('/') + 1);
}

export const isSchema = name => name.endsWith('.schema.json');
export const fileKind = name => isSchema(name) ? 'schemas' : 'files';
export const pairedFile = name => name.slice(0, -'.schema.json'.length) + '.json';

export function associatedSchema(meta, name) {
  if (!name.endsWith('.json') || isSchema(name)) return null;
  const candidate = name.slice(0, -'.json'.length) + '.schema.json';
  return meta.schemas.some(entry => entry.filename === candidate) ? candidate : null;
}

export function checkPaths(names) {
  const known = new Set();
  for (const name of names) {
    filename(name);
    if (known.has(name)) fail(409, 'FILENAME_EXISTS', 'Dateipfad ist bereits vorhanden.');
    known.add(name);
  }
  for (const name of known) {
    let parent = directoryOf(name).slice(0, -1);
    while (parent) {
      if (known.has(parent)) fail(409, 'PATH_CONFLICT', 'Ein Pfad kann nicht gleichzeitig Datei und Ordner sein.');
      parent = directoryOf(parent).slice(0, -1);
    }
  }
}

const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

export function workspaceData(value) {
  if (!isObject(value) || value.version !== 1 || !validToken(value.adminToken)) throw unavailable();
  return value;
}

export function projectData(value, id, prefix) {
  if (!isObject(value) || value.version !== 1 || value.projectId !== id || !isProject(id) ||
      !validToken(value.token) || !['active', 'deleting'].includes(value.state) ||
      !Array.isArray(value.files) || !Array.isArray(value.schemas)) throw unavailable();
  const names = new Set();
  const keys = new Set();
  const objectPrefix = `${prefix}projects/${id}/_objects/`;
  for (const entry of [...value.files, ...value.schemas]) {
    if (!isObject(entry) || !isFilename(entry.filename) || names.has(entry.filename) ||
        typeof entry.objectKey !== 'string' || !entry.objectKey.startsWith(objectPrefix) ||
        !isFilename(entry.objectKey.slice(objectPrefix.length)) ||
        !/^[a-f0-9-]+(?:\.json)?$/.test(entry.objectKey.split('/').at(-1)) || keys.has(entry.objectKey)) throw unavailable();
    if (Object.hasOwn(entry, 'description') && typeof entry.description !== 'string') throw unavailable();
    names.add(entry.filename);
    keys.add(entry.objectKey);
  }
  for (const name of names) {
    let parent = directoryOf(name).slice(0, -1);
    while (parent) {
      if (names.has(parent)) throw unavailable();
      parent = directoryOf(parent).slice(0, -1);
    }
  }
  for (const entry of value.files) {
    if (typeof entry.public !== 'boolean' ||
        (Object.hasOwn(entry, 'title') && typeof entry.title !== 'string')) throw unavailable();
  }
  return value;
}

export function fileInfo(entry, meta) {
  return {
    filename: entry.filename,
    schema: associatedSchema(meta, entry.filename),
    ...descriptionInfo(entry),
    ...(Object.hasOwn(entry, 'title') ? { title: entry.title } : {}),
    public: entry.public,
  };
}

export function descriptionInfo(entry) {
  return Object.hasOwn(entry, 'description') ? { description: entry.description } : {};
}

export function schemaInfo(entry) {
  return { filename: entry.filename, ...descriptionInfo(entry) };
}
