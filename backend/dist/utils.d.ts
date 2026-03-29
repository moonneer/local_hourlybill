/// <reference types="node" />
import type { ServerResponse } from 'http';
export declare function sendJson(res: ServerResponse, statusCode: number, data: object): void;
export declare function sendSseHeaders(res: ServerResponse): void;
export declare function sendSseEvent(res: ServerResponse, event: string, data: unknown): void;
export declare function normalizeSegment(value: string): string;
export declare function extractEmailAddress(value: string): string;
export interface MessageLike {
    metadata?: {
        from?: string;
    };
    headers?: {
        from?: string | string[];
    };
    payload?: {
        headers?: Array<{
            name?: string;
            value?: string;
        }>;
    };
}
export declare function readFromHeader(message: MessageLike): string;
export declare function buildSenderByEmailId(messages: MessageLike[], referencedIds: Set<string>): Record<string, string>;
export declare function validateQueryEntry(entry: unknown): string[];
export declare function safeDownloadName(value: string): string;
export declare function applyInputsPayload(inputs: Record<string, unknown>, payload: Record<string, unknown>): Record<string, unknown>;
//# sourceMappingURL=utils.d.ts.map