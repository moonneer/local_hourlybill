"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createS3Storage = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || 'us-west-2';
function keyFor(userId, relativeKey) {
    const k = relativeKey.replace(/^\/+/, '');
    return userId ? `${userId}/${k}` : k;
}
function createS3Storage(rootDir) {
    const client = new client_s3_1.S3Client({ region: REGION });
    return {
        ROOT_DIR: rootDir,
        async readJson(userId, relativeKey) {
            if (!BUCKET)
                throw new Error('S3_BUCKET not set');
            const key = keyFor(userId, relativeKey);
            try {
                const out = await client.send(new client_s3_1.GetObjectCommand({ Bucket: BUCKET, Key: key }));
                const body = await out.Body.transformToString('utf-8');
                return JSON.parse(body);
            }
            catch (err) {
                const e = err;
                if (e.name === 'NoSuchKey') {
                    const error = new Error(`Key not found: ${key}`);
                    error.code = 'ENOENT';
                    throw error;
                }
                throw err;
            }
        },
        async writeJson(userId, relativeKey, data) {
            if (!BUCKET)
                throw new Error('S3_BUCKET not set');
            const key = keyFor(userId, relativeKey);
            const body = `${JSON.stringify(data, null, 2)}\n`;
            await client.send(new client_s3_1.PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: body,
                ContentType: 'application/json; charset=utf-8',
            }));
        },
        async fileExists(userId, relativeKey) {
            if (!BUCKET)
                return false;
            const key = keyFor(userId, relativeKey);
            try {
                await client.send(new client_s3_1.HeadObjectCommand({ Bucket: BUCKET, Key: key }));
                return true;
            }
            catch (err) {
                const e = err;
                if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404)
                    return false;
                throw err;
            }
        },
        async writeBuffer(userId, relativeKey, buffer) {
            if (!BUCKET)
                throw new Error('S3_BUCKET not set');
            const key = keyFor(userId, relativeKey);
            await client.send(new client_s3_1.PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer }));
        },
        async writeText(userId, relativeKey, text) {
            if (!BUCKET)
                throw new Error('S3_BUCKET not set');
            const key = keyFor(userId, relativeKey);
            await client.send(new client_s3_1.PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: text,
                ContentType: 'text/plain; charset=utf-8',
            }));
        },
        getClientQueryPrefix(clientDir, queryDir) {
            return `clients/${clientDir}/${queryDir}/`;
        },
        getBaseDirPath(_userId, _clientDir, _queryDir) {
            return null;
        },
        useS3() {
            return Boolean(BUCKET);
        },
    };
}
exports.createS3Storage = createS3Storage;
//# sourceMappingURL=s3.js.map