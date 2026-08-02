import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SQLiteDatabase } from 'expo-sqlite';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface SyncTableResult {
  table: string;
  count: number;
}

export interface SyncResult {
  syncedAt: string;
  tables: SyncTableResult[];
}

const SUPABASE_CONFIG_KEY = '@mighty_cafe_supabase_config';
const SUPABASE_LAST_SYNC_KEY = '@mighty_cafe_supabase_last_sync';

const SYNC_TABLES: Array<{ local: string; remote: string; conflict: string }> = [
  { local: 'menu_items', remote: 'menu_items', conflict: 'id' },
  { local: 'inventory_items', remote: 'inventory_items', conflict: 'id' },
  { local: 'recipes', remote: 'recipes', conflict: 'menu_item_id,inventory_item_id' },
  { local: 'staff', remote: 'staff', conflict: 'id' },
  { local: 'sales', remote: 'sales', conflict: 'id' },
  { local: 'sale_items', remote: 'sale_items', conflict: 'id' },
  { local: 'stock_movements', remote: 'stock_movements', conflict: 'id' },
  { local: 'cash_drawer', remote: 'cash_drawer', conflict: 'id' },
  { local: 'cash_transactions', remote: 'cash_transactions', conflict: 'id' },
  { local: 'expenses', remote: 'expenses', conflict: 'id' },
  { local: 'attendance', remote: 'attendance', conflict: 'id' },
  { local: 'product_sections', remote: 'product_sections', conflict: 'id' },
  { local: 'inventory_audits', remote: 'inventory_audits', conflict: 'id' },
  { local: 'inventory_audit_items', remote: 'inventory_audit_items', conflict: 'id' },
];

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function assertConfig(config: SupabaseConfig): SupabaseConfig {
  const url = normalizeUrl(config.url);
  const anonKey = config.anonKey.trim();
  if (!url.startsWith('https://')) {
    throw new Error('Supabase URL must start with https://');
  }
  if (!anonKey) {
    throw new Error('Supabase anon key is required.');
  }
  return { url, anonKey };
}

async function tableExists(db: SQLiteDatabase, tableName: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    tableName,
  );
  return Boolean(row);
}

async function upsertRows(config: SupabaseConfig, table: string, conflict: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const url = `${config.url}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${table} sync failed: ${response.status} ${text}`);
  }
}

export async function loadSupabaseConfig(): Promise<SupabaseConfig | null> {
  const raw = await AsyncStorage.getItem(SUPABASE_CONFIG_KEY);
  if (!raw) return null;
  try {
    return assertConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveSupabaseConfig(config: SupabaseConfig): Promise<void> {
  await AsyncStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(assertConfig(config)));
}

export async function getLastSupabaseSync(): Promise<string | null> {
  return AsyncStorage.getItem(SUPABASE_LAST_SYNC_KEY);
}

export async function testSupabaseConnection(config: SupabaseConfig): Promise<void> {
  const safeConfig = assertConfig(config);
  const response = await fetch(`${safeConfig.url}/rest/v1/menu_items?select=id&limit=1`, {
    headers: {
      apikey: safeConfig.anonKey,
      Authorization: `Bearer ${safeConfig.anonKey}`,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Connection failed: ${response.status} ${text}`);
  }
}

export async function syncLocalDataToSupabase(db: SQLiteDatabase, config: SupabaseConfig): Promise<SyncResult> {
  const safeConfig = assertConfig(config);
  const results: SyncTableResult[] = [];

  for (const table of SYNC_TABLES) {
    if (!(await tableExists(db, table.local))) {
      results.push({ table: table.remote, count: 0 });
      continue;
    }
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table.local}`);
    await upsertRows(safeConfig, table.remote, table.conflict, rows);
    results.push({ table: table.remote, count: rows.length });
  }

  const syncedAt = new Date().toISOString();
  await AsyncStorage.setItem(SUPABASE_LAST_SYNC_KEY, syncedAt);
  return { syncedAt, tables: results };
}
