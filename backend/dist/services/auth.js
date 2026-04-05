"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPassword = exports.deleteSession = exports.getSession = exports.createSession = exports.sanitizeUser = exports.updateUserSubscription = exports.updateUserProfile = exports.getUserByEmail = exports.getUserByStripeCustomerId = exports.getUserById = exports.createUser = exports.authAvailable = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const bcrypt = __importStar(require("bcryptjs"));
const crypto_1 = require("crypto");
const USERS_TABLE = process.env.USERS_TABLE ?? '';
const SESSIONS_TABLE = process.env.SESSIONS_TABLE ?? '';
const SESSION_AGE_SEC = 7 * 24 * 60 * 60; // 7 days
let docClient = null;
function getClient() {
    if (!USERS_TABLE || !SESSIONS_TABLE)
        return null;
    if (!docClient) {
        const client = new client_dynamodb_1.DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-west-2' });
        docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
    }
    return docClient;
}
function authAvailable() {
    return !!(USERS_TABLE && SESSIONS_TABLE);
}
exports.authAvailable = authAvailable;
async function createUser(email, password, firstName, lastName) {
    const client = getClient();
    if (!client)
        throw new Error('Auth not configured');
    const emailNorm = String(email).trim().toLowerCase();
    const fn = String(firstName ?? '').trim();
    const ln = String(lastName ?? '').trim();
    if (!emailNorm || !password || password.length < 8) {
        const err = new Error('Email and password (min 8 characters) are required.');
        err.statusCode = 400;
        throw err;
    }
    if (!fn || !ln) {
        const err = new Error('First name and last name are required.');
        err.statusCode = 400;
        throw err;
    }
    const existing = await getUserByEmail(emailNorm);
    if (existing) {
        const err = new Error('An account with this email already exists.');
        err.statusCode = 409;
        throw err;
    }
    const userId = (0, crypto_1.randomBytes)(16).toString('hex');
    const passwordHash = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();
    const displayName = `${fn} ${ln}`.trim();
    const record = {
        userId,
        email: emailNorm,
        passwordHash,
        createdAt,
        firstName: fn,
        lastName: ln,
        displayName,
    };
    await client.send(new lib_dynamodb_1.PutCommand({
        TableName: USERS_TABLE,
        Item: record,
        ConditionExpression: 'attribute_not_exists(userId)',
    }));
    return record;
}
exports.createUser = createUser;
async function getUserById(userId) {
    const client = getClient();
    if (!client)
        return null;
    const r = await client.send(new lib_dynamodb_1.GetCommand({
        TableName: USERS_TABLE,
        Key: { userId },
    }));
    return r.Item ?? null;
}
exports.getUserById = getUserById;
async function getUserByStripeCustomerId(customerId) {
    const client = getClient();
    if (!client)
        return null;
    const r = await client.send(new lib_dynamodb_1.QueryCommand({
        TableName: USERS_TABLE,
        IndexName: 'by-stripe-customer',
        KeyConditionExpression: 'stripeCustomerId = :c',
        ExpressionAttributeValues: { ':c': customerId },
        Limit: 1,
    }));
    const item = r.Items?.[0];
    return item ? item : null;
}
exports.getUserByStripeCustomerId = getUserByStripeCustomerId;
async function getUserByEmail(email) {
    const client = getClient();
    if (!client)
        return null;
    const emailNorm = String(email).trim().toLowerCase();
    const r = await client.send(new lib_dynamodb_1.QueryCommand({
        TableName: USERS_TABLE,
        IndexName: 'by-email',
        KeyConditionExpression: 'email = :e',
        ExpressionAttributeValues: { ':e': emailNorm },
        Limit: 1,
    }));
    const item = r.Items?.[0];
    return item ? item : null;
}
exports.getUserByEmail = getUserByEmail;
async function updateUserProfile(userId, updates) {
    const client = getClient();
    if (!client)
        return null;
    const user = await getUserById(userId);
    if (!user)
        return null;
    const displayName = updates.displayName !== undefined ? String(updates.displayName).trim() : user.displayName;
    const avatarUrl = updates.avatarUrl !== undefined ? String(updates.avatarUrl).trim() : user.avatarUrl;
    const updated = { ...user, displayName: displayName || undefined, avatarUrl: avatarUrl || undefined };
    await client.send(new lib_dynamodb_1.PutCommand({ TableName: USERS_TABLE, Item: updated }));
    return updated;
}
exports.updateUserProfile = updateUserProfile;
async function updateUserSubscription(userId, fields) {
    const client = getClient();
    if (!client)
        return;
    const exprs = [];
    const names = {};
    const vals = {};
    if (fields.stripeCustomerId !== undefined) {
        exprs.push('#cid = :cid');
        names['#cid'] = 'stripeCustomerId';
        vals[':cid'] = fields.stripeCustomerId;
    }
    if (fields.stripeSubscriptionId !== undefined) {
        exprs.push('#sid = :sid');
        names['#sid'] = 'stripeSubscriptionId';
        vals[':sid'] = fields.stripeSubscriptionId;
    }
    if (fields.subscriptionStatus !== undefined) {
        exprs.push('#ss = :ss');
        names['#ss'] = 'subscriptionStatus';
        vals[':ss'] = fields.subscriptionStatus;
    }
    if (fields.subscriptionCurrentPeriodEnd !== undefined) {
        exprs.push('#pe = :pe');
        names['#pe'] = 'subscriptionCurrentPeriodEnd';
        vals[':pe'] = fields.subscriptionCurrentPeriodEnd;
    }
    if (!exprs.length)
        return;
    await client.send(new lib_dynamodb_1.UpdateCommand({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: `SET ${exprs.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: vals,
    }));
}
exports.updateUserSubscription = updateUserSubscription;
function sanitizeUser(u) {
    return {
        userId: u.userId,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        subscription: {
            status: u.subscriptionStatus ?? 'none',
            currentPeriodEnd: u.subscriptionCurrentPeriodEnd,
        },
    };
}
exports.sanitizeUser = sanitizeUser;
async function createSession(userId) {
    const client = getClient();
    if (!client)
        throw new Error('Auth not configured');
    const sessionToken = (0, crypto_1.randomBytes)(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_AGE_SEC;
    await client.send(new lib_dynamodb_1.PutCommand({
        TableName: SESSIONS_TABLE,
        Item: { sessionToken, userId, expiresAt },
    }));
    return { sessionToken, expiresAt };
}
exports.createSession = createSession;
async function getSession(sessionToken) {
    const client = getClient();
    if (!client)
        return null;
    const r = await client.send(new lib_dynamodb_1.GetCommand({
        TableName: SESSIONS_TABLE,
        Key: { sessionToken },
    }));
    const item = r.Item;
    if (!item || item.expiresAt < Math.floor(Date.now() / 1000))
        return null;
    return item;
}
exports.getSession = getSession;
async function deleteSession(sessionToken) {
    const client = getClient();
    if (!client)
        return;
    await client.send(new lib_dynamodb_1.DeleteCommand({
        TableName: SESSIONS_TABLE,
        Key: { sessionToken },
    }));
}
exports.deleteSession = deleteSession;
async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}
exports.verifyPassword = verifyPassword;
//# sourceMappingURL=auth.js.map