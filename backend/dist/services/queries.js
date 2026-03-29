"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rotateBackups = exports.getTimeEntriesReadKey = exports.getBaseDirInfo = exports.getQueryInfo = exports.getQueryList = void 0;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const config_1 = require("../config");
const utils_1 = require("../utils");
const TIME_ENTRIES_FILENAME = 'time_entries.json';
const BACKUP_COUNT = 5;
async function getQueryList(storage, userId) {
    try {
        const data = (await storage.readJson(userId, 'query.json'));
        return Object.keys(data).filter((name) => name !== 'template');
    }
    catch (err) {
        const e = err;
        if (e.code === 'ENOENT' || e.name === 'NoSuchKey')
            return [];
        throw err;
    }
}
exports.getQueryList = getQueryList;
async function getQueryInfo(storage, userId, queryName) {
    const data = (await storage.readJson(userId, 'query.json'));
    const query = data[queryName];
    if (!query) {
        const error = new Error(`Query '${queryName}' not found in query.json.`);
        error.statusCode = 404;
        throw error;
    }
    if (!query.client_name) {
        const error = new Error(`Query '${queryName}' missing client_name.`);
        error.statusCode = 400;
        throw error;
    }
    return query;
}
exports.getQueryInfo = getQueryInfo;
function getBaseDirInfo(storage, userId, queryName, clientName) {
    const clientDir = (0, utils_1.normalizeSegment)(clientName);
    const queryDir = (0, utils_1.normalizeSegment)(queryName);
    const prefix = storage.getClientQueryPrefix(clientDir, queryDir);
    const dirPath = storage.getBaseDirPath(userId, clientDir, queryDir);
    return { prefix, path: dirPath };
}
exports.getBaseDirInfo = getBaseDirInfo;
async function getTimeEntriesReadKey(storage, userId, prefix) {
    if (await storage.fileExists(userId, prefix + TIME_ENTRIES_FILENAME)) {
        return prefix + TIME_ENTRIES_FILENAME;
    }
    for (let i = 1; i <= BACKUP_COUNT; i++) {
        const bakKey = prefix + `time_entries.bak${i}.json`;
        if (await storage.fileExists(userId, bakKey))
            return bakKey;
    }
    return null;
}
exports.getTimeEntriesReadKey = getTimeEntriesReadKey;
async function rotateBackups(storage, userId, baseDirInfo, sourceKey) {
    if (!sourceKey || !(await storage.fileExists(userId, sourceKey)))
        return false;
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
    if (!basePath)
        return false;
    const sourcePath = path_1.default.join(config_1.ROOT_DIR, sourceKey);
    const tmpPath = path_1.default.join(basePath, '.time_entries_backup_tmp.json');
    await promises_1.default.copyFile(sourcePath, tmpPath);
    const oldestPath = path_1.default.join(basePath, `time_entries.bak${BACKUP_COUNT}.json`);
    try {
        await promises_1.default.access(oldestPath);
        await promises_1.default.unlink(oldestPath);
    }
    catch {
        // ignore
    }
    for (let i = BACKUP_COUNT - 1; i >= 1; i--) {
        const fromPath = path_1.default.join(basePath, `time_entries.bak${i}.json`);
        try {
            await promises_1.default.access(fromPath);
            const toPath = path_1.default.join(basePath, `time_entries.bak${i + 1}.json`);
            await promises_1.default.rename(fromPath, toPath);
        }
        catch {
            // ignore
        }
    }
    const newestPath = path_1.default.join(basePath, 'time_entries.bak1.json');
    await promises_1.default.rename(tmpPath, newestPath);
    return true;
}
exports.rotateBackups = rotateBackups;
//# sourceMappingURL=queries.js.map