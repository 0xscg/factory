import { DirObjectStore, type ObjectStore } from "@factory/core/evidence";
import { env } from "./env";

/**
 * Local-dir object store for now; the R2 ObjectStore implementation
 * replaces this one line when credentials exist (core evidence/store.ts
 * boundary — nothing else in the app changes).
 */
export function getObjectStore(): ObjectStore {
  return new DirObjectStore(env.DATA_DIR);
}
