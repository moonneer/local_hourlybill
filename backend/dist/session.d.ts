import type { RequestWithUserId } from './types';
/** Resolves session from cookie or Authorization and sets req.userId if valid. */
export declare function resolveSession(req: RequestWithUserId): Promise<void>;
export declare function getSessionCookieName(): string;
//# sourceMappingURL=session.d.ts.map