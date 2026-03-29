/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import type { Buffer } from 'buffer';
import type { IncomingMessage, ServerResponse } from 'http';
export interface RequestWithUserId extends IncomingMessage {
    userId?: string;
}
export interface BaseDirInfo {
    prefix: string;
    path: string | null;
}
export interface QueryEntry {
    client_name: string;
    emails: string[];
    keywords: string[];
    exclude_keywords?: string[];
    start: string;
    end: string;
    matters: Record<string, string[]>;
    billing_rate: number;
    requested_timestamp?: string;
}
export interface QueryJson {
    template?: QueryEntry;
    [name: string]: QueryEntry | undefined;
}
export interface Inputs {
    user?: string;
    user_name?: string;
    user_address_line1?: string;
    user_address_line2?: string;
    user_city?: string;
    user_state?: string;
    user_postal_code?: string;
    user_country?: string;
    law_firm_phone?: string;
    law_firm_website?: string;
    law_firm_logo_path?: string;
}
export interface SystemSenders {
    blocked_senders: string[];
    tooltip?: string;
}
/** Storage interface: per-user keys (e.g. 'query.json', 'clients/X/Y/time_entries.json'). */
export interface IStorage {
    readJson(userId: string, key: string): Promise<unknown>;
    writeJson(userId: string, key: string, data: unknown): Promise<void>;
    fileExists(userId: string, key: string): Promise<boolean>;
    writeBuffer(userId: string, key: string, buffer: Buffer): Promise<void>;
    writeText(userId: string, key: string, text: string): Promise<void>;
    getClientQueryPrefix(clientDir: string, queryDir: string): string;
    getBaseDirPath(userId: string, clientDir: string, queryDir: string): string | null;
    useS3(): boolean;
    readonly ROOT_DIR: string;
}
export type SendJson = (res: ServerResponse, statusCode: number, data: object) => void;
export type SendSseEvent = (res: ServerResponse, event: string, data: unknown) => void;
//# sourceMappingURL=types.d.ts.map