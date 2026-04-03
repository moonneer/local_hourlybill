import { ROOT_DIR } from '../config';
import { createS3Storage } from './s3';
import { createFsStorage } from './fs';
import type { IStorage } from './types';

export type { IStorage } from './types';

export function createStorage(): IStorage {
  if (process.env.S3_BUCKET) {
    return createS3Storage(ROOT_DIR);
  }
  return createFsStorage(ROOT_DIR);
}
