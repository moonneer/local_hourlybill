import type { Buffer } from 'buffer';

export interface IStorage {
  readJson(userId: string, key: string): Promise<unknown>;
  writeJson(userId: string, key: string, data: unknown): Promise<void>;
  fileExists(userId: string, key: string): Promise<boolean>;
  writeBuffer(userId: string, key: string, buffer: Buffer): Promise<void>;
  writeText(userId: string, key: string, text: string): Promise<void>;
  getClientQueryPrefix(clientDir: string, queryDir: string): string;
  getBaseDirPath(userId: string, clientDir: string, queryDir: string): string | null;
  useS3(): boolean;
  readonly ROOT_DIR: string;
}
