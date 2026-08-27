// In-memory LibraryStorage fakes for library tests (vitest runs in node —
// no localStorage, no Tauri fs).
import type { LibraryStorage } from '../storage';

export class MemStorage implements LibraryStorage {
  files = new Map<string, string>();
  writes = 0;

  async read(workId: string, file: string): Promise<string | null> {
    return this.files.get(`${workId}/${file}`) ?? null;
  }
  async write(workId: string, file: string, content: string): Promise<void> {
    this.writes++;
    this.files.set(`${workId}/${file}`, content);
  }
  async list(workId: string): Promise<string[]> {
    const prefix = `${workId}/`;
    return [...this.files.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length))
      .sort();
  }
  async mtime(): Promise<number | null> {
    return null;
  }
  async remove(workId: string): Promise<void> {
    const prefix = `${workId}/`;
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix)) this.files.delete(key);
    }
  }
}

/** Writes park until release() — for in-flight-write ordering tests. */
export class GatedStorage extends MemStorage {
  private resolvers: (() => void)[] = [];

  override async write(workId: string, file: string, content: string): Promise<void> {
    await new Promise<void>((resolve) => this.resolvers.push(resolve));
    await super.write(workId, file, content);
  }
  get pendingWrites(): number {
    return this.resolvers.length;
  }
  release(): void {
    this.resolvers.shift()?.();
  }
}

/** Fails the first N writes, then behaves normally. */
export class FlakyStorage extends MemStorage {
  constructor(private failures: number) {
    super();
  }
  override async write(workId: string, file: string, content: string): Promise<void> {
    if (this.failures > 0) {
      this.failures--;
      throw new Error('disk on fire');
    }
    await super.write(workId, file, content);
  }
}
