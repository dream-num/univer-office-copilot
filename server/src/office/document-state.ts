import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** SDK source maps are application metadata; native content remains authoritative. */
export function createDocumentStateStore(dataDir: string) {
  const root = resolve(dataDir, 'document-maps');
  function directory(unitId: string) {
    if (!/^[a-zA-Z0-9-]+$/.test(unitId)) throw new Error('Invalid document identity.');
    return join(root, unitId);
  }
  async function read(unitId: string, name = 'current.json'): Promise<unknown> {
    try {
      return JSON.parse(await readFile(join(directory(unitId), name), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  async function atomic(path: string, value: unknown) {
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(value));
    await rename(temp, path);
  }
  return {
    read: (unitId: string) => read(unitId),
    async save(unitId: string, revision: number, value: unknown) {
      const path = directory(unitId);
      await mkdir(path, { recursive: true });
      await atomic(join(path, `${revision}.json`), value);
      await atomic(join(path, 'current.json'), value);
    },
    async restore(unitId: string, revision: number, newRevision: number) {
      let names: string[];
      try {
        names = await readdir(directory(unitId));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      const prior = names
        .filter((name) => /^\d+\.json$/.test(name) && Number(name.slice(0, -5)) <= revision)
        .sort((a, b) => Number(b.slice(0, -5)) - Number(a.slice(0, -5)))[0];
      const value = prior ? await read(unitId, prior) : null;
      await this.save(unitId, newRevision, value);
    },
  };
}
