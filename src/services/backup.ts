import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import type { SQLiteDatabase } from 'expo-sqlite';

const BACKUP_TABLES = [
  'menu_items', 'inventory_items', 'recipes', 'staff',
  'sales', 'sale_items', 'stock_movements', 'cash_drawer',
  'cash_transactions', 'expenses', 'attendance',
];

export async function exportBackup(db: SQLiteDatabase): Promise<void> {
  const backup: Record<string, any[]> = {};

  for (const table of BACKUP_TABLES) {
    try {
      backup[table] = await db.getAllAsync(`SELECT * FROM ${table}`);
    } catch {
      backup[table] = [];
    }
  }

  const json = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: backup }, null, 2);
  const fileName = `mighty-cafe-backup-${new Date().toISOString().slice(0, 10)}.json`;

  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(json);

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save Backup File' });
  } else {
    throw new Error(`Backup saved to: ${file.uri}`);
  }
}

export async function importBackup(db: SQLiteDatabase): Promise<{ tablesRestored: number; message: string }> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) {
    throw new Error('No file selected');
  }

  const file = new File(result.assets[0].uri);
  let json: string;
  try {
    const response = await fetch(result.assets[0].uri);
    json = await response.text();
  } catch (e) {
    throw new Error(`Could not read backup file: ${e instanceof Error ? e.message : 'unknown error'}`);
  }
  const backup = JSON.parse(json);

  if (!backup.version || !backup.data) {
    throw new Error('Invalid backup file format');
  }

  let tablesRestored = 0;

  await db.withTransactionAsync(async () => {
    for (const table of BACKUP_TABLES) {
      const rows: any[] = backup.data[table] ?? [];
      if (rows.length === 0) continue;

      await db.runAsync(`DELETE FROM ${table}`);

      for (const row of rows) {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map((c) => row[c]);
        await db.runAsync(
          `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
          ...values,
        );
      }
      tablesRestored++;
    }
  });

  return {
    tablesRestored,
    message: `Restored ${tablesRestored} tables from backup dated ${backup.exportedAt?.slice(0, 10) ?? 'unknown'}.`,
  };
}
