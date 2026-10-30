export const STORAGE_GATEWAY = Symbol('STORAGE_GATEWAY');

/** Application code depends on this seam, never on a storage SDK. Writing the same key twice is safe. */
export interface StorageGateway {
  put(object: { key: string; bytes: Buffer }): Promise<void>;
  /** Null when nothing is stored under [key]. */
  get(key: string): Promise<Buffer | null>;
}
