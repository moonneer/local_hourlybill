/**
 * Storage abstraction: per-user data in S3 (when S3_BUCKET is set) or on local fs (single-user).
 * Keys are relative to the user: 'query.json', 'inputs.json', 'system_senders.json',
 * 'clients/{clientDir}/{queryDir}/time_entries.json', etc.
 * Used by local_bill_editor/server.js when backend/dist is not built.
 */

const path = require('path');
const fs = require('fs/promises');

const ROOT_DIR = path.resolve(__dirname, '../..');
const S3_BUCKET = process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';

let s3Client = null;

function getS3Client() {
  if (!s3Client && S3_BUCKET) {
    const { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
    s3Client = new S3Client({ region: AWS_REGION });
  }
  return s3Client;
}

function keyFor(userId, relativeKey) {
  const k = relativeKey.replace(/^\/+/, '');
  return userId ? `${userId}/${k}` : k;
}

function fsPath(userId, relativeKey) {
  return path.join(ROOT_DIR, relativeKey);
}

async function readJson(userId, relativeKey) {
  if (S3_BUCKET) {
    const s3 = getS3Client();
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const key = keyFor(userId, relativeKey);
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      const body = await out.Body.transformToString('utf-8');
      return JSON.parse(body);
    } catch (err) {
      if (err.name === 'NoSuchKey') {
        const e = new Error(`Key not found: ${key}`);
        e.code = 'ENOENT';
        throw e;
      }
      throw err;
    }
  }
  const filePath = fsPath(userId, relativeKey);
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(userId, relativeKey, data) {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  if (S3_BUCKET) {
    const s3 = getS3Client();
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const key = keyFor(userId, relativeKey);
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: 'application/json; charset=utf-8',
    }));
    return;
  }
  const filePath = fsPath(userId, relativeKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
}

async function fileExists(userId, relativeKey) {
  if (S3_BUCKET) {
    const s3 = getS3Client();
    const { HeadObjectCommand } = require('@aws-sdk/client-s3');
    const key = keyFor(userId, relativeKey);
    try {
      await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      return true;
    } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
      throw err;
    }
  }
  const filePath = fsPath(userId, relativeKey);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeBuffer(userId, relativeKey, buffer) {
  if (S3_BUCKET) {
    const s3 = getS3Client();
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const key = keyFor(userId, relativeKey);
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
    }));
    return;
  }
  const filePath = fsPath(userId, relativeKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

async function writeText(userId, relativeKey, text) {
  const body = typeof text === 'string' ? text : String(text);
  if (S3_BUCKET) {
    const s3 = getS3Client();
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const key = keyFor(userId, relativeKey);
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: 'text/plain; charset=utf-8',
    }));
    return;
  }
  const filePath = fsPath(userId, relativeKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
}

function getClientQueryPrefix(clientDir, queryDir) {
  return `clients/${clientDir}/${queryDir}/`;
}

function getBaseDirPath(userId, clientDir, queryDir) {
  if (S3_BUCKET) return null;
  return path.join(ROOT_DIR, 'clients', clientDir, queryDir);
}

function useS3() {
  return Boolean(S3_BUCKET);
}

module.exports = {
  readJson,
  writeJson,
  fileExists,
  writeBuffer,
  writeText,
  getClientQueryPrefix,
  getBaseDirPath,
  useS3,
  ROOT_DIR,
};
