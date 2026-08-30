/**
 * SQLite connection bootstrap.
 * This is a minimal stub for the Storage module to extend.
 */

export interface SQLiteResult {
  rows: { _array: any[]; length: number };
  insertId?: number;
  rowsAffected: number;
}

// Basic memory implementation of DB to allow for tests
let _mockDb: any[] = [];

export const db = {
  executeSql: async (query: string, params: any[] = []): Promise<SQLiteResult> => {
    // For real implementation this delegates to react-native-quick-sqlite.
    // Since we don't have the real DB here, we return an empty result.
    return { rows: { _array: [], length: 0 }, rowsAffected: 0 };
  },
  // Mock method to execute a transaction
  transaction: async (callback: (tx: any) => void): Promise<void> => {
    // Provide a mock transaction object that simply calls executeSql
    const tx = {
      executeSql: async (query: string, params: any[] = []) => {
        return db.executeSql(query, params);
      }
    };
    callback(tx);
  }
};
