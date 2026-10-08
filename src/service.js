import { randomUUID } from 'node:crypto';
import { Locks } from './locks.js';
import { ApiError, StorageConflict, conflict, fail, unavailable } from './errors.js';
import { projectId, filename, directoryOf, isProject, workspaceData, projectData, newToken, sameToken, fileInfo, schemaInfo, descriptionInfo, associatedSchema, pairedFile, isSchema, fileKind, checkPaths } from './model.js';
import { compileSchema, validateContent, validateFileWithSchema } from './validation.js';
import { BODY_LIMIT, contentType, parseJson, decodeBase64, uploadBytes } from './files.js';

export async function initializeWorkspace(storage) {
  const key = storage.workspaceKey();
  const current = await storage.get(key);
  if (current) {
    workspaceData(current.data);
    return { initialized: false };
  }
  const adminToken = newToken();
  try {
    await storage.put(key, { version: 1, adminToken });
    return { initialized: true, adminToken };
  } catch (error) {
    if (!(error instanceof StorageConflict)) throw error;
    const winner = await storage.get(key);
    if (!winner) throw unavailable();
    workspaceData(winner.data);
    return { initialized: false };
  }
}

export class Service {
  constructor(storage, logger) {
    this.storage = storage;
    this.logger = logger;
    this.locks = new Locks();
  }

  async workspace() {
    const record = await this.storage.get(this.storage.workspaceKey());
    if (!record) throw new ApiError(503, 'WORKSPACE_NOT_INITIALIZED', 'Workspace ist nicht initialisiert.');
    workspaceData(record.data);
    return record;
  }

  async project(id) {
    const record = await this.storage.get(this.storage.metaKey(id));
    if (record) projectData(record.data, id, this.storage.prefix);
    return record;
  }

  async authorize(token, meta, adminOnly = false) {
    if (!token) fail(401, 'UNAUTHORIZED', 'Bearer-Token fehlt oder ist ungültig.');
    const workspace = await this.workspace();
    if (sameToken(token, workspace.data.adminToken)) return;
    if (meta && sameToken(token, meta.token)) {
      if (adminOnly) fail(403, 'FORBIDDEN', 'Diese Funktion benötigt den Admin-Token.');
      return;
    }
    // Distinguish an invalid token (401) from a valid token for another project
    // or an admin-only operation (403), without accepting cached credentials.
    for await (const id of this.storage.projectIds()) {
      if (!isProject(id)) continue;
      const other = await this.project(id);
      if (other && sameToken(token, other.data.token)) fail(403, 'FORBIDDEN', 'Token besitzt nicht die erforderlichen Rechte.');
    }
    fail(401, 'UNAUTHORIZED', 'Bearer-Token fehlt oder ist ungültig.');
  }

  async listProjects(token) {
    await this.authorize(token, null, true);
    const projects = [];
    for await (const id of this.storage.projectIds()) {
      if (!isProject(id)) continue;
      const record = await this.project(id);
      if (record) projects.push({ projectId: id, state: record.data.state, token: record.data.token });
    }
    return { projects: projects.sort((a, b) => a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0) };
  }

  async createProject(token, id) {
    projectId(id);
    return this.locks.run(id, async () => {
      await this.authorize(token, null, true);
      // Some S3-compatible providers ignore If-None-Match. The process lock
      // and this read also protect existing projects on those providers.
      if (await this.project(id)) fail(409, 'PROJECT_EXISTS', 'Projektname ist bereits vorhanden.');
      const meta = { version: 1, projectId: id, token: newToken(), state: 'active', revision: randomUUID(), files: [], schemas: [] };
      try { await this.storage.put(this.storage.metaKey(id), meta); }
      catch (error) {
        if (error instanceof StorageConflict) fail(409, 'PROJECT_EXISTS', 'Projektname ist bereits vorhanden.');
        throw error;
      }
      return { projectId: id, token: meta.token };
    });
  }

  async rotateAdmin(token) {
    return this.locks.run('_workspace', async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        await this.authorize(token, null, true);
        const record = await this.workspace();
        if (!sameToken(token, record.data.adminToken)) fail(401, 'UNAUTHORIZED', 'Admin-Token ist nicht mehr gültig.');
        const adminToken = newToken();
        try {
          await this.storage.put(this.storage.workspaceKey(), { ...record.data, adminToken }, record.etag);
          return { adminToken };
        } catch (error) { if (!(error instanceof StorageConflict)) throw error; }
      }
      throw conflict();
    });
  }

  async withProject(token, id, operation, { adminOnly = false, deleting = false, publicRead = false } = {}) {
    projectId(id);
    return this.locks.run(id, async () => {
      const record = await this.project(id);
      if (!publicRead) await this.authorize(token, record?.data, adminOnly);
      if (!record) fail(404, 'NOT_FOUND', 'Projekt nicht gefunden.');
      if (record.data.state === 'deleting' && !deleting) {
        fail(publicRead ? 404 : 409, publicRead ? 'NOT_FOUND' : 'PROJECT_DELETING', publicRead ? 'Datei nicht gefunden.' : 'Projekt wird gelöscht.');
      }
      return operation(record);
    });
  }

  checkRevision(record, revision) {
    if (!revision) fail(428, 'PRECONDITION_REQUIRED', 'If-Match ist erforderlich.');
    if (revision !== record.etag) fail(412, 'REVISION_MISMATCH', 'Revision ist veraltet; aktuellen Stand erneut laden.');
  }

  entry(meta, kind, name) {
    filename(name);
    const entry = meta[kind].find(item => item.filename === name);
    if (!entry) fail(404, 'NOT_FOUND', 'Datei oder Schema nicht gefunden.');
    return entry;
  }

  ensureNew(meta, name) {
    filename(name);
    const entries = [...meta.files, ...meta.schemas];
    if (entries.some(item => item.filename === name)) fail(409, 'FILENAME_EXISTS', 'Dateipfad ist bereits vorhanden.');
    if (entries.some(item => name.startsWith(`${item.filename}/`) || item.filename.startsWith(`${name}/`))) {
      fail(409, 'PATH_CONFLICT', 'Ein Pfad kann nicht gleichzeitig Datei und Ordner sein.');
    }
  }

  async content(entry) {
    const record = await this.storage.getBytes(entry.objectKey);
    if (!record) throw unavailable();
    return record.data;
  }

  async validator(meta, name) {
    const schemaName = associatedSchema(meta, name);
    if (!schemaName) return null;
    const bytes = await this.content(this.entry(meta, 'schemas', schemaName));
    try { return compileSchema(parseJson(bytes, true)); } catch { throw unavailable(); }
  }

  async cleanup(keys) {
    for (const key of keys) {
      try { await this.storage.discard(key); }
      catch { this.logger?.warn({ code: 'OBJECT_CLEANUP_FAILED' }, 'Nicht referenzierte Fassung konnte nicht bereinigt werden.'); }
    }
  }

  async mutate(token, id, change, { revision, needsRevision = false, adminOnly = false } = {}) {
    return this.withProject(token, id, async initial => {
      let record = initial;
      for (let attempt = 0; attempt < (needsRevision ? 1 : 3); attempt++) {
        if (attempt) {
          record = await this.project(id);
          if (!record) fail(404, 'NOT_FOUND', 'Projekt nicht gefunden.');
          await this.authorize(token, record.data, adminOnly);
          if (record.data.state !== 'active') fail(409, 'PROJECT_DELETING', 'Projekt wird gelöscht.');
        }
        if (needsRevision) this.checkRevision(record, revision);
        const meta = structuredClone(record.data);
        const result = await change(meta);
        // Associations are derived exclusively from names, including old records.
        for (const entry of meta.files) delete entry.schema;
        meta.revision = randomUUID();
        const drafts = [];
        try {
          for (const object of result.objects ?? []) {
            const directory = directoryOf(object.entry.filename);
            const key = `${this.storage.projectPrefix(id)}_objects/${directory}${randomUUID()}`;
            await this.storage.putBytes(key, object.bytes, contentType(object.entry.filename));
            drafts.push(key);
            object.entry.objectKey = key;
          }
        } catch (error) {
          // No metadata write has started, so acknowledged drafts are unreferenced.
          await this.cleanup(drafts);
          throw error;
        }
        let saved;
        try {
          saved = await this.storage.put(this.storage.metaKey(id), meta, record.etag);
        } catch (error) {
          if (!(error instanceof StorageConflict)) {
            this.logger?.warn({ code: 'UNCERTAIN_METADATA_WRITE' }, 'Storage-Schreibergebnis ist unklar; aktuellen Stand erneut lesen.');
            throw error; // The write may have committed: retain all payloads.
          }
          await this.cleanup(drafts);
          if (needsRevision) fail(412, 'REVISION_MISMATCH', 'Revision ist veraltet; aktuellen Stand erneut laden.');
          continue;
        }
        // Cleanup is deliberately outside the commit catch: published payloads
        // must never be discarded when only the subsequent cleanup fails.
        if (result.sweep) {
          try {
            await this.storage.pruneObjects(id, new Set([...meta.files, ...meta.schemas].map(entry => entry.objectKey)));
          } catch {
            fail(503, 'CLEANUP_INCOMPLETE', 'Neuer Bestand ist veröffentlicht; Bereinigung unvollständig. Push erneut ausführen.');
          }
        } else {
          await this.cleanup(result.removed ?? []);
        }
        return { data: result.data, etag: saved.etag };
      }
      throw conflict();
    }, { adminOnly });
  }

  rotateProject(token, id) {
    return this.mutate(token, id, async meta => {
      meta.token = newToken();
      return { data: { projectId: id, token: meta.token } };
    }, { adminOnly: true });
  }

  list(token, id, kind) {
    return this.withProject(token, id, async ({ data, etag }) => ({
      data: { [kind]: data[kind].map(entry => kind === 'files' ? fileInfo(entry, data) : schemaInfo(entry)) }, etag,
    }));
  }

  setDescription(token, id, kind, name, description, revision) {
    if (description !== null && typeof description !== 'string') fail(400, 'INVALID_REQUEST', 'Description muss Text oder null sein.');
    return this.mutate(token, id, async meta => {
      const entry = this.entry(meta, kind, name);
      if (description === null) delete entry.description;
      else entry.description = description;
      return { data: kind === 'files' ? fileInfo(entry, meta) : schemaInfo(entry) };
    }, { needsRevision: true, revision });
  }

  listJsonFiles(token, id) {
    return this.withProject(token, id, async ({ data }) => ({
      files: data.files.filter(entry => entry.filename.endsWith('.json') && !isSchema(entry.filename))
        .map(entry => {
          const { public: visibility, ...info } = fileInfo(entry, data);
          return info;
        }),
    }));
  }

  jsonFilename(name) {
    filename(name);
    if (!name.endsWith('.json') || isSchema(name)) fail(400, 'JSON_FILE_REQUIRED', 'Nur JSON-Inhaltsdateien können über MCP bearbeitet werden.');
  }

  readJsonFile(token, id, name) {
    this.jsonFilename(name);
    return this.withProject(token, id, async ({ data, etag }) => {
      const entry = this.entry(data, 'files', name);
      const schemaName = associatedSchema(data, name);
      const schemaEntry = schemaName ? this.entry(data, 'schemas', schemaName) : null;
      return {
        filename: name, ...descriptionInfo(entry),
        content: parseJson(await this.content(entry), true),
        schemaFilename: schemaName,
        schema: schemaEntry ? parseJson(await this.content(schemaEntry), true) : null,
        ...(schemaEntry && Object.hasOwn(schemaEntry, 'description') ? { schemaDescription: schemaEntry.description } : {}),
        revision: etag,
      };
    });
  }

  async saveJsonFile(token, id, name, content, revision) {
    this.jsonFilename(name);
    const encoded = JSON.stringify(content, null, 2);
    if (encoded === undefined) fail(400, 'INVALID_REQUEST', 'JSON-Inhalt fehlt.');
    const bytes = Buffer.from(`${encoded}\n`);
    if (bytes.length > BODY_LIMIT) fail(400, 'INVALID_REQUEST', 'JSON-Datei überschreitet das Größenlimit.');
    const saved = await this.saveFile(token, id, name, bytes, revision);
    return { filename: name, revision: saved.etag };
  }

  get(token, id, kind, name, publicRead = false) {
    return this.withProject(token, id, async record => {
      const entry = this.entry(record.data, kind, name);
      if (publicRead && (!entry.public || isSchema(name))) fail(404, 'NOT_FOUND', 'Datei nicht gefunden.');
      return { data: await this.content(entry), etag: record.etag, contentType: contentType(name) };
    }, { publicRead });
  }

  async validateFile(meta, name, bytes) {
    if (!name.endsWith('.json')) return;
    const value = parseJson(bytes);
    const validate = await this.validator(meta, name);
    if (validate) validateContent(validate, value, name);
  }

  async validateSchema(meta, name, bytes) {
    if (!isSchema(name)) fail(400, 'INVALID_SCHEMA_FILENAME', 'Schema-Dateien müssen auf .schema.json enden.');
    const validate = compileSchema(parseJson(bytes, false, true));
    const file = meta.files.find(entry => entry.filename === pairedFile(name));
    if (file) validateContent(validate, parseJson(await this.content(file), true), file.filename);
  }

  addFile(token, id, body) {
    return this.mutate(token, id, async meta => {
      this.ensureNew(meta, body.filename);
      if (isSchema(body.filename)) fail(400, 'SCHEMA_ROUTE_REQUIRED', 'Schema-Dateien über die Schema-Route anlegen.');
      const bytes = uploadBytes(body, 'content');
      if (!Object.hasOwn(body, 'dataBase64') && !body.filename.endsWith('.json')) {
        fail(400, 'BINARY_UPLOAD_REQUIRED', 'Für Nicht-JSON-Dateien dataBase64 verwenden.');
      }
      await this.validateFile(meta, body.filename, bytes);
      const entry = {
        filename: body.filename, public: body.public ?? false,
        ...(Object.hasOwn(body, 'title') ? { title: body.title } : {}),
        ...descriptionInfo(body),
      };
      meta.files.push(entry);
      return { data: fileInfo(entry, meta), objects: [{ entry, bytes }] };
    });
  }

  saveFile(token, id, name, bytes, revision) {
    return this.mutate(token, id, async meta => {
      const entry = this.entry(meta, 'files', name);
      await this.validateFile(meta, name, bytes);
      return { data: fileInfo(entry, meta), objects: [{ entry, bytes }], removed: [entry.objectKey] };
    }, { needsRevision: true, revision });
  }

  saveFileWithSchema(token, id, name, body, revision) {
    return this.mutate(token, id, async meta => {
      const entry = this.entry(meta, 'files', name);
      const bytes = decodeBase64(body.dataBase64);
      const schemaBytes = decodeBase64(body.schemaBase64);
      const schemaName = validateFileWithSchema(name, bytes, schemaBytes);
      let schemaEntry = meta.schemas.find(item => item.filename === schemaName);
      const removed = [entry.objectKey];
      if (schemaEntry) removed.push(schemaEntry.objectKey);
      else {
        this.ensureNew(meta, schemaName);
        schemaEntry = { filename: schemaName };
        meta.schemas.push(schemaEntry);
      }
      return {
        data: fileInfo(entry, meta),
        objects: [{ entry, bytes }, { entry: schemaEntry, bytes: schemaBytes }],
        removed,
      };
    }, { needsRevision: true, revision });
  }

  setPublic(token, id, name, value) {
    return this.mutate(token, id, async meta => {
      const entry = this.entry(meta, 'files', name);
      if (isSchema(name)) fail(400, 'SCHEMA_NOT_PUBLIC', 'Schema-Dateien können nicht öffentlich freigegeben werden.');
      entry.public = value;
      return { data: { filename: name, public: value } };
    });
  }

  addSchema(token, id, body) {
    return this.mutate(token, id, async meta => {
      this.ensureNew(meta, body.filename);
      const bytes = uploadBytes(body, 'schema');
      await this.validateSchema(meta, body.filename, bytes);
      const entry = { filename: body.filename, ...descriptionInfo(body) };
      meta.schemas.push(entry);
      return { data: schemaInfo(entry), objects: [{ entry, bytes }] };
    });
  }

  saveSchema(token, id, name, bytes, revision) {
    return this.mutate(token, id, async meta => {
      const entry = this.entry(meta, 'schemas', name);
      await this.validateSchema(meta, name, bytes);
      return { data: schemaInfo(entry), objects: [{ entry, bytes }], removed: [entry.objectKey] };
    }, { needsRevision: true, revision });
  }

  deleteFile(token, id, kind, name, revision) {
    return this.mutate(token, id, async meta => {
      const entry = this.entry(meta, kind, name);
      meta[kind] = meta[kind].filter(item => item.filename !== name);
      return { data: null, removed: [entry.objectKey] };
    }, { needsRevision: true, revision });
  }

  snapshot(token, id) {
    return this.withProject(token, id, async record => {
      const files = [];
      for (const entry of [...record.data.files, ...record.data.schemas].sort((a, b) => a.filename.localeCompare(b.filename))) {
        files.push({ filename: entry.filename, dataBase64: (await this.content(entry)).toString('base64') });
      }
      return { data: { files }, etag: record.etag };
    });
  }

  replaceSnapshot(token, id, snapshot, revision) {
    return this.mutate(token, id, async meta => {
      checkPaths(snapshot.files.map(file => file.filename));
      const previous = new Map([...meta.files, ...meta.schemas].map(file => [file.filename, file]));
      const objects = [];
      const validators = new Map();
      meta.files = [];
      meta.schemas = [];
      for (const file of snapshot.files) {
        const bytes = decodeBase64(file.dataBase64);
        const kind = fileKind(file.filename);
        const old = previous.get(file.filename);
        const entry = kind === 'schemas' ? { filename: file.filename } : {
          filename: file.filename, public: old?.public ?? false,
          ...(old && Object.hasOwn(old, 'title') ? { title: old.title } : {}),
        };
        Object.assign(entry, old ? descriptionInfo(old) : {});
        meta[kind].push(entry);
        objects.push({ entry, bytes });
        if (kind === 'schemas') validators.set(file.filename, compileSchema(parseJson(bytes, false, true)));
      }
      // Validate against the desired snapshot, not against the old schemas.
      for (const { entry, bytes } of objects) {
        if (fileKind(entry.filename) === 'files' && entry.filename.endsWith('.json')) {
          const value = parseJson(bytes);
          const validate = validators.get(associatedSchema(meta, entry.filename));
          if (validate) validateContent(validate, value, entry.filename);
        }
      }
      return { data: { files: objects.length }, objects, sweep: true };
    }, { needsRevision: true, revision });
  }

  deleteProject(token, id, confirmation) {
    return this.withProject(token, id, async initial => {
      if (confirmation !== id) fail(400, 'CONFIRMATION_REQUIRED', 'confirmProject muss exakt dem Projektnamen entsprechen.');
      let record = initial;
      for (let attempt = 0; record.data.state !== 'deleting'; attempt++) {
        if (attempt >= 3) throw conflict();
        try {
          record = await this.storage.put(this.storage.metaKey(id), { ...record.data, state: 'deleting', revision: randomUUID() }, record.etag);
        } catch (error) {
          if (!(error instanceof StorageConflict)) throw error;
          record = await this.project(id);
          if (!record) fail(404, 'NOT_FOUND', 'Projekt nicht gefunden.');
          await this.authorize(token, record.data, true);
        }
      }
      await this.storage.purgeProject(id);
    }, { adminOnly: true, deleting: true });
  }
}
