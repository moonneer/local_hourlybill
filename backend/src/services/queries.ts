import path from 'path';
import fs from 'fs/promises';
import type { IStorage } from '../storage/types';
import { ROOT_DIR } from '../config';
import { normalizeSegment } from '../utils';
import type { BaseDirInfo } from '../types';

const TIME_ENTRIES_FILENAME = 'time_entries.json';
const BACKUP_COUNT = 5;

export async function getQueryList(storage: IStorage, userId: string): Promise<string[]> {
  try {
    const data = (await storage.readJson(userId, 'query.json')) as Record<string, unknown>;
    return Object.keys(data).filter((name) => name !== 'template');
  } catch (err: unknown) {
    const e = err as { code?: string; name?: string };
    if (e.code === 'ENOENT' || e.name === 'NoSuchKey') return [];
    throw err;
  }
}

export async function getQueryInfo(
  storage: IStorage,
  userId: string,
  queryName: string
): Promise<Record<string, unknown>> {
  const data = (await storage.readJson(userId, 'query.json')) as Record<string, unknown>;
  const query = data[queryName] as Record<string, unknown> | undefined;
  if (!query) {
    const error = new Error(`Query '${queryName}' not found in query.json.`);
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }
  if (!query.client_name) {
    const error = new Error(`Query '${queryName}' missing client_name.`);
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  return query;
}

export function getBaseDirInfo(
  storage: IStorage,
  userId: string,
  queryName: string,
  clientName: string
): BaseDirInfo {
  const clientDir = normalizeSegment(clientName);
  const queryDir = normalizeSegment(queryName);
  const prefix = storage.getClientQueryPrefix(clientDir, queryDir);
  const dirPath = storage.getBaseDirPath(userId, clientDir, queryDir);
  return { prefix, path: dirPath };
}

export async function getTimeEntriesReadKey(
  storage: IStorage,
  userId: string,
  prefix: string
): Promise<string | null> {
  if (await storage.fileExists(userId, prefix + TIME_ENTRIES_FILENAME)) {
    return prefix + TIME_ENTRIES_FILENAME;
  }
  for (let i = 1; i <= BACKUP_COUNT; i++) {
    const bakKey = prefix + `time_entries.bak${i}.json`;
    if (await storage.fileExists(userId, bakKey)) return bakKey;
  }
  return null;
}

export async function rotateBackups(
  storage: IStorage,
  userId: string,
  baseDirInfo: BaseDirInfo,
  sourceKey: string | null
): Promise<boolean> {
  if (!sourceKey || !(await storage.fileExists(userId, sourceKey))) return false;
  const { prefix, path: basePath } = baseDirInfo;
  if (storage.useS3()) {
    const data = await storage.readJson(userId, sourceKey);
    for (let i = BACKUP_COUNT - 1; i >= 1; i--) {
      const fromKey = prefix + `time_entries.bak${i}.json`;
      const toKey = prefix + `time_entries.bak${i + 1}.json`;
      if (await storage.fileExists(userId, fromKey)) {
        const content = await storage.readJson(userId, fromKey);
        await storage.writeJson(userId, toKey, content);
      }
    }
    await storage.writeJson(userId, prefix + 'time_entries.bak1.json', data);
    return true;
  }
  if (!basePath) return false;
  const sourcePath = path.join(ROOT_DIR, sourceKey);
  const tmpPath = path.join(basePath, '.time_entries_backup_tmp.json');
  await fs.copyFile(sourcePath, tmpPath);
  const oldestPath = path.join(basePath, `time_entries.bak${BACKUP_COUNT}.json`);
  try {
    await fs.access(oldestPath);
    await fs.unlink(oldestPath);
  } catch {
    // ignore
  }
  for (let i = BACKUP_COUNT - 1; i >= 1; i--) {
    const fromPath = path.join(basePath, `time_entries.bak${i}.json`);
    try {
      await fs.access(fromPath);
      const toPath = path.join(basePath, `time_entries.bak${i + 1}.json`);
      await fs.rename(fromPath, toPath);
    } catch {
      // ignore
    }
  }
  const newestPath = path.join(basePath, 'time_entries.bak1.json');
  await fs.rename(tmpPath, newestPath);
  return true;
}
