/// <reference types="node" />
/// <reference types="node" />
import type { URL } from 'url';
import type { ServerResponse } from 'http';
import type { IStorage } from '../storage/types';
import type { RequestWithUserId } from '../types';
export declare function handleApi(req: RequestWithUserId, res: ServerResponse, urlObj: URL, storage: IStorage): Promise<void>;
//# sourceMappingURL=api.d.ts.map