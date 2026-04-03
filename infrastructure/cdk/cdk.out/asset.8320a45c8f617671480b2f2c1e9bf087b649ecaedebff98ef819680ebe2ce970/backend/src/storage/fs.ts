import path from 'path';
import fs from 'fs/promises';
import type { IStorage } from './types';

export function createFsStorage(rootDir: string): IStorage {
  function fsPath(_userId: string, relativeKey: string): string {
    return path.join(rootDir, relativeKey);
  }

  return {
    ROOT_DIR: rootDir,

    async readJson(userId: string, relativeKey: string): Promise<unknown> {
      const filePath = fsPath(userId, relativeKey);
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as unknown;
    },

    async writeJson(userId: string, relativeKey: string, data: unknown): Promise<void> {
      const filePath = fsPath(userId, relativeKey);
      const body = `${JSON.stringify(data, null, 2)}\n`;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, body);
    },

    async fileExists(userId: string, relativeKey: string): Promise<boolean> {
      const filePath = fsPath(userId, relativeKey);
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },

    async writeBuffer(userId: string, relativeKey: string, buffer: Buffer): Promise<void> {
      const filePath = fsPath(userId, relativeKey);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, buffer);
    },

    async writeText(userId: string, relativeKey: string, text: string): Promise<void> {
      const filePath = fsPath(userId, relativeKey);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, text);
    },

    getClientQueryPrefix(clientDir: string, queryDir: string): string {
      return `clients/${clientDir}/${queryDir}/`;
    },

    getBaseDirPath(userId: string, clientDir: string, queryDir: string): string | null {
      return path.join(rootDir, 'clients', clientDir, queryDir);
    },

    useS3(): boolean {
      return false;
    },
  };
}
