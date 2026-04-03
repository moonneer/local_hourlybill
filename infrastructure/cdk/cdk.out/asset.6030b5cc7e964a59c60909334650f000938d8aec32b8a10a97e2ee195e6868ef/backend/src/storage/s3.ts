import path from 'path';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import type { IStorage } from './types';

const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || 'us-west-2';

function keyFor(userId: string, relativeKey: string): string {
  const k = relativeKey.replace(/^\/+/, '');
  return userId ? `${userId}/${k}` : k;
}

export function createS3Storage(rootDir: string): IStorage {
  const client = new S3Client({ region: REGION });

  return {
    ROOT_DIR: rootDir,

    async readJson(userId: string, relativeKey: string): Promise<unknown> {
      if (!BUCKET) throw new Error('S3_BUCKET not set');
      const key = keyFor(userId, relativeKey);
      try {
        const out = await client.send(
          new GetObjectCommand({ Bucket: BUCKET, Key: key })
        );
        const body = await out.Body!.transformToString('utf-8');
        return JSON.parse(body) as unknown;
      } catch (err: unknown) {
        const e = err as { name?: string };
        if (e.name === 'NoSuchKey') {
          const error = new Error(`Key not found: ${key}`);
          (error as NodeJS.ErrnoException).code = 'ENOENT';
          throw error;
        }
        throw err;
      }
    },

    async writeJson(userId: string, relativeKey: string, data: unknown): Promise<void> {
      if (!BUCKET) throw new Error('S3_BUCKET not set');
      const key = keyFor(userId, relativeKey);
      const body = `${JSON.stringify(data, null, 2)}\n`;
      await client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: body,
          ContentType: 'application/json; charset=utf-8',
        })
      );
    },

    async fileExists(userId: string, relativeKey: string): Promise<boolean> {
      if (!BUCKET) return false;
      const key = keyFor(userId, relativeKey);
      try {
        await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        return true;
      } catch (err: unknown) {
        const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return false;
        throw err;
      }
    },

    async writeBuffer(userId: string, relativeKey: string, buffer: Buffer): Promise<void> {
      if (!BUCKET) throw new Error('S3_BUCKET not set');
      const key = keyFor(userId, relativeKey);
      await client.send(
        new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer })
      );
    },

    async writeText(userId: string, relativeKey: string, text: string): Promise<void> {
      if (!BUCKET) throw new Error('S3_BUCKET not set');
      const key = keyFor(userId, relativeKey);
      await client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: text,
          ContentType: 'text/plain; charset=utf-8',
        })
      );
    },

    getClientQueryPrefix(clientDir: string, queryDir: string): string {
      return `clients/${clientDir}/${queryDir}/`;
    },

    getBaseDirPath(_userId: string, _clientDir: string, _queryDir: string): string | null {
      return null;
    },

    useS3(): boolean {
      return Boolean(BUCKET);
    },
  };
}
