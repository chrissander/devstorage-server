import { extname } from 'node:path';
import { fail, unavailable } from './errors.js';

export const BODY_LIMIT = 16 * 1024 * 1024;

const types = {
  '.json': 'application/json', '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.xml': 'application/xml',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.avif': 'image/avif', '.pdf': 'application/pdf',
  '.zip': 'application/zip', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

export const contentType = name => types[extname(name).toLowerCase()] ?? 'application/octet-stream';

export function decodeBase64(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) {
    fail(400, 'INVALID_BASE64', 'dataBase64 muss gültiges Base64 enthalten.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) fail(400, 'INVALID_BASE64', 'dataBase64 ist nicht kanonisch kodiert.');
  return bytes;
}

export function parseJson(bytes, stored = false, schema = false) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return JSON.parse(text);
  } catch {
    if (stored) throw unavailable();
    fail(schema ? 422 : 400, schema ? 'INVALID_SCHEMA' : 'INVALID_JSON', 'Datei enthält kein gültiges UTF-8-JSON.');
  }
}

export function uploadBytes(body, field) {
  return Object.hasOwn(body, 'dataBase64') ? decodeBase64(body.dataBase64) : Buffer.from(JSON.stringify(body[field]));
}
