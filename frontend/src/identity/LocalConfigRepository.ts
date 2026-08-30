import { db } from '../storage/database';

export interface LocalConfigRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  getNumber(key: string, fallback: number): Promise<number>;
}

export class SQLiteLocalConfigRepository implements LocalConfigRepository {
  async get(key: string): Promise<string | null> {
    const result = await db.executeSql('SELECT value FROM local_config WHERE key = ?', [key]);
    if (result.rows._array.length > 0) {
      return result.rows._array[0].value;
    }
    return null;
  }

  async set(key: string, value: string): Promise<void> {
    const now = Date.now();
    await db.executeSql(
      `INSERT OR REPLACE INTO local_config (key, value, updated_at) VALUES (?, ?, ?)`,
      [key, value, now]
    );
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    const val = await this.get(key);
    if (val === null) return fallback;
    const parsed = Number(val);
    return isNaN(parsed) ? fallback : parsed;
  }
}
