function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} fehlt.`);
  return value;
}

function httpUrl(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} ist keine gültige URL.`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} muss eine HTTP(S)-URL ohne Zugangsdaten, Query oder Fragment sein.`);
  }
  return url.toString().replace(/\/$/, '');
}

export function storageConfig(env = process.env) {
  const bucket = required(env, 'DEV_STORAGE_S3_BUCKET');
  const rawPrefix = env.DEV_STORAGE_S3_PREFIX ?? '';
  if (rawPrefix.startsWith('/') || rawPrefix.includes('\\') ||
      rawPrefix.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('DEV_STORAGE_S3_PREFIX muss leer oder ein relativer S3-Prefix sein.');
  }
  const pathStyle = env.DEV_STORAGE_S3_FORCE_PATH_STYLE ?? 'false';
  if (!['true', 'false'].includes(pathStyle)) throw new Error('DEV_STORAGE_S3_FORCE_PATH_STYLE muss true oder false sein.');
  return {
    bucket,
    prefix: rawPrefix === '' ? '' : `${rawPrefix.replace(/\/+$/, '')}/`,
    region: env.AWS_REGION || undefined,
    endpoint: env.DEV_STORAGE_S3_ENDPOINT ? httpUrl(env.DEV_STORAGE_S3_ENDPOINT, 'DEV_STORAGE_S3_ENDPOINT') : undefined,
    forcePathStyle: pathStyle === 'true',
  };
}

export function serverConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT muss zwischen 1 und 65535 liegen.');
  return { port, host: env.HOST || '127.0.0.1' };
}

export function cliConfig(env = process.env) {
  return {
    url: httpUrl(required(env, 'DEV_STORAGE_API_URL'), 'DEV_STORAGE_API_URL'),
    token: required(env, 'DEV_STORAGE_ADMIN_TOKEN'),
  };
}
