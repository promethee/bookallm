/** A value a SQL statement can take or return in this app. */
export type SqlValue = string | number | null;

/**
 * The little the SQLite library needs from a database: run a statement, read rows. The
 * desktop app provides it through Tauri's SQL plugin; tests provide it with Node's
 * built-in `node:sqlite`, so both run the same SQL on the same engine.
 */
export interface SqlDatabase {
  /** Runs one statement that returns no rows, with `?` placeholders for `values`. */
  execute(sql: string, values?: SqlValue[]): Promise<void>;
  /** Runs one query and returns its rows as objects keyed by column name. */
  select<T>(sql: string, values?: SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
}

// `String.fromCharCode(...bytes)` on a whole chapter would exceed the argument limit.
const CHUNK = 0x8000;

/**
 * Float32 numbers as base64 text of their bytes: exact, and about 5.3 characters per
 * number instead of the 20 or so a JSON number takes (the SQL plugin speaks JSON).
 */
export function encodeFloats(values: Float32Array): string {
  const bytes = new Uint8Array(
    values.buffer,
    values.byteOffset,
    values.byteLength,
  );
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

/** The Float32 numbers `encodeFloats` wrote. */
export function decodeFloats(text: string): Float32Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
