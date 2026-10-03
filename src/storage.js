import {
  S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand,
  ListObjectsV2Command, DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { StorageConflict, unavailable } from './errors.js';

export class Storage {
  constructor(config) {
    this.bucket = config.bucket;
    this.prefix = config.prefix;
    // Do not blindly retry conditional writes: a lost success response can
    // otherwise become a misleading precondition failure on the next attempt.
    this.client = new S3Client({
      region: config.region, endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle, maxAttempts: 1,
    });
  }

  workspaceKey() { return `${this.prefix}_workspace.json`; }
  projectPrefix(id) { return `${this.prefix}projects/${id}/`; }
  metaKey(id) { return `${this.projectPrefix(id)}_meta.json`; }

  async send(Command, input) {
    try {
      return await this.client.send(new Command({ Bucket: this.bucket, ...input }), { abortSignal: AbortSignal.timeout(30_000) });
    } catch (error) {
      if (['PreconditionFailed', 'ConditionalRequestConflict'].includes(error.name) ||
          [409, 412].includes(error.$metadata?.httpStatusCode)) throw new StorageConflict();
      throw unavailable();
    }
  }

  async getBytes(key) {
    let result;
    try {
      result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: AbortSignal.timeout(30_000) });
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.name === 'NotFound') return null;
      throw unavailable();
    }
    try {
      if (!result.ETag || !result.Body) throw unavailable();
      return { data: Buffer.from(await result.Body.transformToByteArray()), etag: result.ETag };
    } catch { throw unavailable(); }
  }

  async get(key) {
    const result = await this.getBytes(key);
    if (!result) return null;
    try { return { ...result, data: JSON.parse(result.data.toString('utf8')) }; }
    catch { throw unavailable(); }
  }

  async put(key, data, etag) {
    const result = await this.putBytes(key, Buffer.from(JSON.stringify(data)), 'application/json', etag);
    return { ...result, data };
  }

  async putBytes(key, data, contentType, etag) {
    const result = await this.send(PutObjectCommand, {
      Key: key, Body: data, ContentType: contentType,
      CacheControl: 'no-store',
      ...(etag === undefined ? { IfNoneMatch: '*' } : { IfMatch: etag }),
    });
    if (!result.ETag) throw unavailable();
    return { data, etag: result.ETag };
  }

  async discard(key) {
    await this.send(DeleteObjectCommand, { Key: key });
  }

  async *projectIds() {
    const prefix = `${this.prefix}projects/`;
    let continuation;
    do {
      const page = await this.send(ListObjectsV2Command, {
        Prefix: prefix, Delimiter: '/', ContinuationToken: continuation,
      });
      for (const item of page.CommonPrefixes ?? []) {
        yield item.Prefix.slice(prefix.length, -1);
      }
      continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !continuation) throw unavailable();
    } while (continuation);
  }

  async deleteBatch(objects) {
    if (!objects.length) return;
    const result = await this.send(DeleteObjectsCommand, { Delete: { Objects: objects, Quiet: true } });
    if (result.Errors?.length) throw unavailable();
  }

  async pruneObjects(id, keep) {
    let continuation;
    do {
      const page = await this.send(ListObjectsV2Command, {
        Prefix: `${this.projectPrefix(id)}_objects/`, ContinuationToken: continuation,
      });
      await this.deleteBatch((page.Contents ?? []).filter(item => !keep.has(item.Key)).map(item => ({ Key: item.Key })));
      continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !continuation) throw unavailable();
    } while (continuation);
  }

  async purgeProject(id) {
    const prefix = this.projectPrefix(id);
    const metaKey = this.metaKey(id);
    // Keep deleting metadata until all other objects have been removed, so
    // interrupted deletion remains resumable. Buckets must be unversioned.
    let continuation;
    do {
      const page = await this.send(ListObjectsV2Command, { Prefix: prefix, ContinuationToken: continuation });
      await this.deleteBatch((page.Contents ?? []).filter(item => item.Key !== metaKey).map(item => ({ Key: item.Key })));
      continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !continuation) throw unavailable();
    } while (continuation);
    const remaining = await this.send(ListObjectsV2Command, { Prefix: prefix });
    if (remaining.IsTruncated || remaining.Contents?.some(item => item.Key !== metaKey)) throw unavailable();
    await this.discard(metaKey);
  }

  close() { this.client.destroy(); }
}
