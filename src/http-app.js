import Fastify from 'fastify';
import { mcpConfig } from './config.js';
import { handleMcp, isMcpPath } from './mcp.js';
import cors from '@fastify/cors';
import { ApiError, StorageConflict, conflict, fail } from './errors.js';
import { projectPattern, filenamePattern, isObject } from './model.js';
import { Service } from './service.js';
import { validationDetails } from './validation.js';
import { BODY_LIMIT, parseJson } from './files.js';

const name = { type: 'string', pattern: filenamePattern, not: { pattern: '\\.\\.' } };
const objectBody = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });

function rewriteFileUrl(request) {
  const queryIndex = request.url.indexOf('?');
  const path = queryIndex < 0 ? request.url : request.url.slice(0, queryIndex);
  const query = queryIndex < 0 ? '' : request.url.slice(queryIndex);
  const match = /^(\/v1\/(?:projects\/[^/]+\/(files|schemas)|public\/[^/]+)\/)(.+)$/.exec(path);
  if (!match) return request.url;
  let filename = match[3];
  let action = '';
  const method = request.method === 'OPTIONS' ? request.headers['access-control-request-method'] : request.method;
  if (match[2] === 'files' && method === 'POST') {
    const suffix = /\/(public|private)$/.exec(filename);
    if (suffix) {
      action = suffix[0];
      filename = filename.slice(0, -action.length);
    }
  }
  // Route a relative path as one parameter. Do not normalize dot segments or
  // decode here: the router decodes once, then the filename validator checks it.
  return `${match[1]}${filename.replaceAll('/', '%2F')}${action}${query}`;
}

function bearer(request) {
  const header = request.headers.authorization;
  return typeof header === 'string' ? /^Bearer ([A-Za-z0-9_-]+)$/i.exec(header)?.[1] : undefined;
}

function json(reply, data, status = 200, etag) {
  if (etag) reply.header('ETag', etag);
  // Explicit serialization also delivers JSON strings and null as JSON bodies.
  return reply.code(status).type('application/json; charset=utf-8').send(JSON.stringify(data));
}

export async function buildApp(storage, { logger = true, createFastify = Fastify } = {}) {
  const app = createFastify({
    logger: logger === true ? {
      redact: ['req.headers.authorization'],
      serializers: { req: req => ({ method: req.method, url: req.url?.split('?')[0] }) },
    } : logger,
    exposeHeadRoutes: false,
    rewriteUrl: rewriteFileUrl,
    routerOptions: { maxParamLength: 4096 },
    bodyLimit: BODY_LIMIT,
    ajv: { customOptions: { coerceTypes: false, useDefaults: false, removeAdditional: false, ownProperties: true } },
  });
  const service = new Service(storage, app.log);
  const routes = [];
  const { allowedOrigins } = mcpConfig();

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store, no-transform');
    if (isMcpPath(request.raw.url) && request.headers.origin !== undefined && !allowedOrigins.has(request.headers.origin)) {
      fail(403, 'ORIGIN_NOT_ALLOWED', 'Origin ist für MCP nicht freigegeben.');
    }
  });
  await app.register(cors, { delegator: (request, callback) => {
    const path = request.raw.url.split('?')[0];
    const methods = routes.filter(route => route.pattern.test(path)).map(route => route.method);
    callback(null, {
      origin: isMcpPath(path) ? (request.headers.origin && allowedOrigins.has(request.headers.origin) ? request.headers.origin : false) : '*', methods: [...new Set([...methods, 'OPTIONS'])],
      allowedHeaders: ['Authorization', 'Content-Type', 'If-Match', 'MCP-Protocol-Version'],
      exposedHeaders: ['ETag'], credentials: false, strictPreflight: false,
    });
  } });

  // Parse API envelopes in preValidation; file PUT bodies remain exact bytes.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

  app.setErrorHandler((error, request, reply) => {
    let safe;
    if (error instanceof ApiError) safe = error;
    else if (error instanceof StorageConflict) safe = conflict();
    else if (error.validation) safe = new ApiError(400, 'INVALID_REQUEST', 'Ungültige Anfrage.', validationDetails(error.validation));
    else if (error.statusCode >= 400 && error.statusCode < 500) safe = new ApiError(400, 'INVALID_REQUEST', 'Ungültige Anfrage oder zu großer JSON-Body.');
    else safe = new ApiError(500, 'INTERNAL_ERROR', 'Interner Serverfehler.');
    if (safe.statusCode >= 500) request.log.error({ code: safe.code, requestId: request.id }, 'Anfrage fehlgeschlagen.');
    if (safe.statusCode === 401) reply.header('WWW-Authenticate', 'Bearer');
    reply.header('Cache-Control', 'no-store, no-transform');
    if (!isMcpPath(request.raw.url)) reply.header('Access-Control-Allow-Origin', '*').header('Access-Control-Expose-Headers', 'ETag');
    return json(reply, { error: {
      code: safe.code, message: safe.message,
      ...(safe.details ? { details: safe.details } : {}),
    } }, safe.statusCode);
  });
  app.setNotFoundHandler((_request, reply) => json(reply, { error: { code: 'NOT_FOUND', message: 'Route nicht gefunden.' } }, 404));
  app.addHook('onClose', async () => { storage.close(); });

  function route(method, url, handler, { body, rawBody = false } = {}) {
    const properties = {};
    if (url.includes(':projectId')) properties.projectId = { type: 'string', pattern: projectPattern };
    if (url.includes(':filename')) properties.filename = name;
    if (url.includes(':schemaName')) properties.schemaName = name;
    routes.push({ method, pattern: new RegExp(`^${url.replace(/:[A-Za-z]+/g, '[^/]+')}$`) });
    app.route({
      method, url,
      schema: {
        ...(Object.keys(properties).length ? { params: objectBody(properties, Object.keys(properties)) } : {}),
        ...(body ? { body } : {}),
      },
      preValidation: async request => {
        if (rawBody) request.body ??= Buffer.alloc(0);
        if (body) {
          if (request.body === undefined) fail(400, 'BODY_REQUIRED', 'JSON-Body ist erforderlich.');
          request.body = parseJson(request.body);
          if (!isObject(request.body)) fail(400, 'INVALID_REQUEST', 'Body muss ein JSON-Objekt sein.');
        }
      },
      handler,
    });
  }

  for (const method of ['POST', 'GET', 'DELETE']) {
    route(method, '/v1/projects/:projectId/mcp', (req, reply) => handleMcp(req, reply, service, bearer(req)));
  }

  route('POST', '/v1/admin/token/rotate', async (req, reply) => json(reply, await service.rotateAdmin(bearer(req))));
  route('GET', '/v1/projects', async (req, reply) => json(reply, await service.listProjects(bearer(req))));
  route('POST', '/v1/projects', async (req, reply) => json(reply, await service.createProject(bearer(req), req.body.projectId), 201), {
    body: objectBody({ projectId: { type: 'string', pattern: projectPattern } }, ['projectId']),
  });
  route('DELETE', '/v1/projects/:projectId', async (req, reply) => {
    await service.deleteProject(bearer(req), req.params.projectId, req.body.confirmProject);
    return reply.code(204).send();
  }, { body: objectBody({ confirmProject: { type: 'string' } }, ['confirmProject']) });
  route('POST', '/v1/projects/:projectId/token/rotate', async (req, reply) => {
    const result = await service.rotateProject(bearer(req), req.params.projectId);
    return json(reply, result.data);
  });

  for (const kind of ['files', 'schemas']) {
    const base = `/v1/projects/:projectId/${kind}`;
    const parameter = kind === 'files' ? 'filename' : 'schemaName';
    route('GET', base, async (req, reply) => {
      const result = await service.list(bearer(req), req.params.projectId, kind);
      return json(reply, result.data, 200, result.etag);
    });
    route('GET', `${base}/:${parameter}`, async (req, reply) => {
      const result = await service.get(bearer(req), req.params.projectId, kind, req.params[parameter]);
      return reply.header('ETag', result.etag).type(result.contentType).send(result.data);
    });
    route('PUT', `${base}/:${parameter}`, async (req, reply) => {
      const args = [bearer(req), req.params.projectId, req.params[parameter], req.body, req.headers['if-match']];
      const result = kind === 'files' ? await service.saveFile(...args) : await service.saveSchema(...args);
      return json(reply, result.data, 200, result.etag);
    }, { rawBody: true });
    route('PATCH', `${base}/:${parameter}`, async (req, reply) => {
      const result = await service.setDescription(bearer(req), req.params.projectId, kind, req.params[parameter], req.body.description, req.headers['if-match']);
      return json(reply, result.data, 200, result.etag);
    }, { body: objectBody({ description: { type: ['string', 'null'] } }, ['description']) });
    route('DELETE', `${base}/:${parameter}`, async (req, reply) => {
      const result = await service.deleteFile(bearer(req), req.params.projectId, kind, req.params[parameter], req.headers['if-match']);
      return reply.header('ETag', result.etag).code(204).send();
    });
  }
  function uploadBody(field, properties = {}) {
    return {
      ...objectBody({ filename: name, [field]: {}, dataBase64: { type: 'string' }, ...properties }, ['filename']),
      oneOf: [{ required: [field] }, { required: ['dataBase64'] }],
    };
  }
  route('POST', '/v1/projects/:projectId/files', async (req, reply) => {
    const result = await service.addFile(bearer(req), req.params.projectId, req.body);
    return json(reply, result.data, 201, result.etag);
  }, { body: uploadBody('content', { title: { type: 'string' }, description: { type: 'string' }, public: { type: 'boolean' } }) });
  route('POST', '/v1/projects/:projectId/schemas', async (req, reply) => {
    const result = await service.addSchema(bearer(req), req.params.projectId, req.body);
    return json(reply, result.data, 201, result.etag);
  }, { body: uploadBody('schema', { description: { type: 'string' } }) });
  for (const visibility of ['public', 'private']) {
    route('POST', `/v1/projects/:projectId/files/:filename/${visibility}`, async (req, reply) => {
      const result = await service.setPublic(bearer(req), req.params.projectId, req.params.filename, visibility === 'public');
      return json(reply, result.data, 200, result.etag);
    });
  }
  route('GET', '/v1/projects/:projectId/snapshot', async (req, reply) => {
    const result = await service.snapshot(bearer(req), req.params.projectId);
    return json(reply, result.data, 200, result.etag);
  });
  route('PUT', '/v1/projects/:projectId/snapshot', async (req, reply) => {
    const result = await service.replaceSnapshot(bearer(req), req.params.projectId, req.body, req.headers['if-match']);
    return json(reply, result.data, 200, result.etag);
  }, { body: objectBody({ files: {
    type: 'array', items: objectBody({ filename: name, dataBase64: { type: 'string' } }, ['filename', 'dataBase64']),
  } }, ['files']) });
  route('GET', '/v1/public/:projectId/:filename', async (req, reply) => {
    const result = await service.get(undefined, req.params.projectId, 'files', req.params.filename, true);
    return reply.header('ETag', result.etag).type(result.contentType).send(result.data);
  });
  return app;
}
