import type { SqlDatabase } from './sql';

/**
 * The desktop app's library database: a file in the app's data folder, preloaded by the
 * SQL plugin (see `src-tauri/tauri.conf.json`).
 */
export const DATABASE_URL = 'sqlite:bookallm.db';

/** Opens the library database through Tauri's SQL plugin. Desktop app only. */
export async function openPluginDatabase(): Promise<SqlDatabase> {
  const { default: Database } = await import('@tauri-apps/plugin-sql');
  const db = await Database.load(DATABASE_URL);
  return {
    async execute(sql, values = []) {
      await db.execute(sql, values);
    },
    select: (sql, values = []) => db.select(sql, values),
    async close() {
      await db.close();
    },
  };
}
