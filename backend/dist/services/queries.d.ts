import type { IStorage } from '../storage/types';
import type { BaseDirInfo } from '../types';
export declare function getQueryList(storage: IStorage, userId: string): Promise<string[]>;
export declare function getQueryInfo(storage: IStorage, userId: string, queryName: string): Promise<Record<string, unknown>>;
export declare function getBaseDirInfo(storage: IStorage, userId: string, queryName: string, clientName: string): BaseDirInfo;
export declare function getTimeEntriesReadKey(storage: IStorage, userId: string, prefix: string): Promise<string | null>;
export declare function rotateBackups(storage: IStorage, userId: string, baseDirInfo: BaseDirInfo, sourceKey: string | null): Promise<boolean>;
//# sourceMappingURL=queries.d.ts.map