import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SqlDatabase } from '../sql';

/**
 * A `SqlDatabase` over Node's built-in SQLite, for tests: the same SQL, run by the same
 * engine as the desktop app's SQL plugin. In memory unless given a file path.
 */
export function nodeSqliteDatabase(path = ':memory:'): SqlDatabase {
  const db = new DatabaseSync(path);
  return {
    async execute(sql, values = []) {
      db.prepare(sql).run(...(values as SQLInputValue[]));
    },
    async select<T>(sql: string, values: unknown[] = []) {
      return db.prepare(sql).all(...(values as SQLInputValue[])) as T[];
    },
    async close() {
      db.close();
    },
  };
}
