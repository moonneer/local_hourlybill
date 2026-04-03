import type { IStorage } from '../storage/types';
import { applyInputsPayload } from '../utils';

export async function readInputs(
  storage: IStorage,
  userId: string
): Promise<Record<string, unknown>> {
  if (!(await storage.fileExists(userId, 'inputs.json'))) return {};
  return (await storage.readJson(userId, 'inputs.json')) as Record<string, unknown>;
}

export async function updateInputs(
  storage: IStorage,
  userId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const inputs = await readInputs(storage, userId);
  const updated = applyInputsPayload(inputs, payload);
  if (!String(updated.user ?? '').trim()) {
    const error = new Error('user is required.');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  await storage.writeJson(userId, 'inputs.json', updated);
  return updated;
}
