"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFsStorage = void 0;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
function createFsStorage(rootDir) {
    function fsPath(_userId, relativeKey) {
        return path_1.default.join(rootDir, relativeKey);
    }
    return {
        ROOT_DIR: rootDir,
        async readJson(userId, relativeKey) {
            const filePath = fsPath(userId, relativeKey);
            const raw = await promises_1.default.readFile(filePath, 'utf-8');
            return JSON.parse(raw);
        },
        async writeJson(userId, relativeKey, data) {
            const filePath = fsPath(userId, relativeKey);
            const body = `${JSON.stringify(data, null, 2)}\n`;
            await promises_1.default.mkdir(path_1.default.dirname(filePath), { recursive: true });
            await promises_1.default.writeFile(filePath, body);
        },
        async fileExists(userId, relativeKey) {
            const filePath = fsPath(userId, relativeKey);
            try {
                await promises_1.default.access(filePath);
                return true;
            }
            catch {
                return false;
            }
        },
        async writeBuffer(userId, relativeKey, buffer) {
            const filePath = fsPath(userId, relativeKey);
            await promises_1.default.mkdir(path_1.default.dirname(filePath), { recursive: true });
            await promises_1.default.writeFile(filePath, buffer);
        },
        async writeText(userId, relativeKey, text) {
            const filePath = fsPath(userId, relativeKey);
            await promises_1.default.mkdir(path_1.default.dirname(filePath), { recursive: true });
            await promises_1.default.writeFile(filePath, text);
        },
        getClientQueryPrefix(clientDir, queryDir) {
            return `clients/${clientDir}/${queryDir}/`;
        },
        getBaseDirPath(userId, clientDir, queryDir) {
            return path_1.default.join(rootDir, 'clients', clientDir, queryDir);
        },
        useS3() {
            return false;
        },
    };
}
exports.createFsStorage = createFsStorage;
//# sourceMappingURL=fs.js.map