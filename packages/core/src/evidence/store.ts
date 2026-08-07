import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

/**
 * Object-storage boundary. Production is Cloudflare R2 via its
 * S3-compatible API (implementation lands when credentials exist —
 * plan Phase 1.5); tests and local dev use the memory/dir stores.
 * Keys are immutable blobs: put() must refuse to overwrite.
 */
export interface ObjectStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
}

export class ObjectExistsError extends Error {
  constructor(key: string) {
    super(`object already exists (evidence is immutable): ${key}`);
    this.name = "ObjectExistsError";
  }
}

export class ObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`object not found: ${key}`);
    this.name = "ObjectNotFoundError";
  }
}

export class MemoryObjectStore implements ObjectStore {
  private objects = new Map<string, Uint8Array>();

  async put(key: string, bytes: Uint8Array): Promise<void> {
    if (this.objects.has(key)) throw new ObjectExistsError(key);
    this.objects.set(key, Uint8Array.from(bytes));
  }

  async get(key: string): Promise<Uint8Array> {
    const bytes = this.objects.get(key);
    if (!bytes) throw new ObjectNotFoundError(key);
    return Uint8Array.from(bytes);
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
}

/** Local-dev store under a root directory; keys must stay inside it. */
export class DirObjectStore implements ObjectStore {
  /** Normalized without trailing separator, so the escape check is exact. */
  private readonly root: string;

  constructor(root: string) {
    const normalized = normalize(root);
    this.root = normalized.endsWith(sep)
      ? normalized.slice(0, -sep.length)
      : normalized;
  }

  private pathFor(key: string): string {
    const path = normalize(join(this.root, key));
    if (!path.startsWith(this.root + sep)) {
      throw new Error(`key escapes store root: ${key}`);
    }
    return path;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const path = this.pathFor(key);
    if (await this.exists(key)) throw new ObjectExistsError(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: "wx" });
  }

  async get(key: string): Promise<Uint8Array> {
    try {
      return new Uint8Array(await readFile(this.pathFor(key)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT")
        throw new ObjectNotFoundError(key);
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw err;
    }
  }
}
