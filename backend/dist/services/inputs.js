"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateInputs = exports.readInputs = void 0;
const utils_1 = require("../utils");
async function readInputs(storage, userId) {
    if (!(await storage.fileExists(userId, 'inputs.json')))
        return {};
    return (await storage.readJson(userId, 'inputs.json'));
}
exports.readInputs = readInputs;
async function updateInputs(storage, userId, payload) {
    const inputs = await readInputs(storage, userId);
    const updated = (0, utils_1.applyInputsPayload)(inputs, payload);
    if (!String(updated.user ?? '').trim()) {
        const error = new Error('user is required.');
        error.statusCode = 400;
        throw error;
    }
    await storage.writeJson(userId, 'inputs.json', updated);
    return updated;
}
exports.updateInputs = updateInputs;
//# sourceMappingURL=inputs.js.map