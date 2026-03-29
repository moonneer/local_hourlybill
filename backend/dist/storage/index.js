"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStorage = void 0;
const config_1 = require("../config");
const s3_1 = require("./s3");
const fs_1 = require("./fs");
function createStorage() {
    if (process.env.S3_BUCKET) {
        return (0, s3_1.createS3Storage)(config_1.ROOT_DIR);
    }
    return (0, fs_1.createFsStorage)(config_1.ROOT_DIR);
}
exports.createStorage = createStorage;
//# sourceMappingURL=index.js.map