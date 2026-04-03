import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const USERS_TABLE = process.env.USERS_TABLE ?? '';
const SESSIONS_TABLE = process.env.SESSIONS_TABLE ?? '';
const SESSION_AGE_SEC = 7 * 24 * 60 * 60; // 7 days

let docClient: DynamoDBDocumentClient | null = null;

function getClient(): DynamoDBDocumentClient | null {
  if (!USERS_TABLE || !SESSIONS_TABLE) return null;
  if (!docClient) {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-west-2' });
    docClient = DynamoDBDocumentClient.from(client);
  }
  return docClient;
}

export function authAvailable(): boolean {
  return !!(USERS_TABLE && SESSIONS_TABLE);
}

export interface UserRecord {
  userId: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface SessionRecord {
  sessionToken: string;
  userId: string;
  expiresAt: number;
}

export async function createUser(
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<UserRecord> {
  const client = getClient();
  if (!client) throw new Error('Auth not configured');
  const emailNorm = String(email).trim().toLowerCase();
  const fn = String(firstName ?? '').trim();
  const ln = String(lastName ?? '').trim();
  if (!emailNorm || !password || password.length < 8) {
    const err = new Error('Email and password (min 8 characters) are required.');
    (err as { statusCode?: number }).statusCode = 400;
    throw err;
  }
  if (!fn || !ln) {
    const err = new Error('First name and last name are required.');
    (err as { statusCode?: number }).statusCode = 400;
    throw err;
  }
  const existing = await getUserByEmail(emailNorm);
  if (existing) {
    const err = new Error('An account with this email already exists.');
    (err as { statusCode?: number }).statusCode = 409;
    throw err;
  }
  const userId = randomBytes(16).toString('hex');
  const passwordHash = await bcrypt.hash(password, 10);
  const createdAt = new Date().toISOString();
  const displayName = `${fn} ${ln}`.trim();
  const record: UserRecord = {
    userId,
    email: emailNorm,
    passwordHash,
    createdAt,
    firstName: fn,
    lastName: ln,
    displayName,
  };
  await client.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: record,
    ConditionExpression: 'attribute_not_exists(userId)',
  }));
  return record;
}

export async function getUserById(userId: string): Promise<UserRecord | null> {
  const client = getClient();
  if (!client) return null;
  const r = await client.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { userId },
  }));
  return (r.Item as UserRecord) ?? null;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const client = getClient();
  if (!client) return null;
  const emailNorm = String(email).trim().toLowerCase();
  const r = await client.send(new QueryCommand({
    TableName: USERS_TABLE,
    IndexName: 'by-email',
    KeyConditionExpression: 'email = :e',
    ExpressionAttributeValues: { ':e': emailNorm },
    Limit: 1,
  }));
  const item = r.Items?.[0];
  return item ? (item as UserRecord) : null;
}

export async function updateUserProfile(
  userId: string,
  updates: { displayName?: string; avatarUrl?: string }
): Promise<UserRecord | null> {
  const client = getClient();
  if (!client) return null;
  const user = await getUserById(userId);
  if (!user) return null;
  const displayName = updates.displayName !== undefined ? String(updates.displayName).trim() : user.displayName;
  const avatarUrl = updates.avatarUrl !== undefined ? String(updates.avatarUrl).trim() : user.avatarUrl;
  const updated = { ...user, displayName: displayName || undefined, avatarUrl: avatarUrl || undefined };
  await client.send(new PutCommand({ TableName: USERS_TABLE, Item: updated }));
  return updated;
}

export function sanitizeUser(u: UserRecord): {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
} {
  return {
    userId: u.userId,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
  };
}

export async function createSession(userId: string): Promise<{ sessionToken: string; expiresAt: number }> {
  const client = getClient();
  if (!client) throw new Error('Auth not configured');
  const sessionToken = randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_AGE_SEC;
  await client.send(new PutCommand({
    TableName: SESSIONS_TABLE,
    Item: { sessionToken, userId, expiresAt },
  }));
  return { sessionToken, expiresAt };
}

export async function getSession(sessionToken: string): Promise<SessionRecord | null> {
  const client = getClient();
  if (!client) return null;
  const r = await client.send(new GetCommand({
    TableName: SESSIONS_TABLE,
    Key: { sessionToken },
  }));
  const item = r.Item as SessionRecord | undefined;
  if (!item || item.expiresAt < Math.floor(Date.now() / 1000)) return null;
  return item;
}

export async function deleteSession(sessionToken: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.send(new DeleteCommand({
    TableName: SESSIONS_TABLE,
    Key: { sessionToken },
  }));
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
