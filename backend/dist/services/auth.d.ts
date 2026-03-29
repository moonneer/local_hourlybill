export declare function authAvailable(): boolean;
export interface UserRecord {
    userId: string;
    email: string;
    passwordHash: string;
    createdAt: string;
    displayName?: string;
    avatarUrl?: string;
}
export interface SessionRecord {
    sessionToken: string;
    userId: string;
    expiresAt: number;
}
export declare function createUser(email: string, password: string): Promise<UserRecord>;
export declare function getUserById(userId: string): Promise<UserRecord | null>;
export declare function getUserByEmail(email: string): Promise<UserRecord | null>;
export declare function updateUserProfile(userId: string, updates: {
    displayName?: string;
    avatarUrl?: string;
}): Promise<UserRecord | null>;
export declare function sanitizeUser(u: UserRecord): {
    userId: string;
    email: string;
    displayName?: string;
    avatarUrl?: string;
};
export declare function createSession(userId: string): Promise<{
    sessionToken: string;
    expiresAt: number;
}>;
export declare function getSession(sessionToken: string): Promise<SessionRecord | null>;
export declare function deleteSession(sessionToken: string): Promise<void>;
export declare function verifyPassword(password: string, hash: string): Promise<boolean>;
//# sourceMappingURL=auth.d.ts.map