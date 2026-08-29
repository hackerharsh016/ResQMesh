/**
 * SQLite connection bootstrap.
 * This is a minimal stub for the Storage module to extend.
 */

export interface SQLiteResult {
  rows: { _array: any[] };
  insertId?: number;
  rowsAffected: number;
}

export const db = {
  executeSql: async (query: string, params: any[] = []): Promise<SQLiteResult> => {
    // Stub to be replaced with actual react-native-quick-sqlite or expo-sqlite implementation
    return { rows: { _array: [] }, rowsAffected: 0 };
  }
};
