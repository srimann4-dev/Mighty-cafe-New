import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import {
  adjustInventoryQuantity,
  createInventoryItem,
  getInventoryItems,
  getInventoryRecipeLinks,
  getMenuItems,
  replaceInventoryRecipeLinks,
  updateInventoryItem,
} from '@/db/repository';
import type { InventoryItem, InventoryRecipeLink, MenuItem } from '@/types';

export function useInventory() {
  const db = useSQLiteContext();
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [recipeLinks, setRecipeLinks] = useState<InventoryRecipeLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    const [inventoryRows, menuRows, recipeRows] = await Promise.all([
      getInventoryItems(db),
      getMenuItems(db),
      getInventoryRecipeLinks(db),
    ]);
    setInventoryItems(inventoryRows);
    setMenuItems(menuRows);
    setRecipeLinks(recipeRows);
    setIsLoading(false);
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  const addStock = useCallback(
    async (inventoryItemId: string, quantity: number) => {
      await adjustInventoryQuantity(db, inventoryItemId, Math.abs(quantity), 'Stock added from inventory screen', 'stock_addition');
      await reload();
    },
    [db, reload],
  );

  const adjustStock = useCallback(
    async (inventoryItemId: string, quantity: number, note: string) => {
      await adjustInventoryQuantity(db, inventoryItemId, quantity, note, 'manual_adjustment');
      await reload();
    },
    [db, reload],
  );

  const saveInventoryItem = useCallback(
    async (payload: Pick<InventoryItem, 'id' | 'name' | 'quantity' | 'unit' | 'barcode' | 'lowStockThreshold'>) => {
      if (payload.id) {
        await updateInventoryItem(db, payload);
      } else {
        await createInventoryItem(db, payload);
      }
      await reload();
    },
    [db, reload],
  );

  const saveRecipeLinks = useCallback(
    async (inventoryItemId: string, links: Array<{ menuItemId: string; quantityRequired: number }>) => {
      await replaceInventoryRecipeLinks(db, inventoryItemId, links);
      await reload();
    },
    [db, reload],
  );

  return {
    inventoryItems,
    menuItems,
    recipeLinks,
    isLoading,
    reload,
    addStock,
    adjustStock,
    saveInventoryItem,
    saveRecipeLinks,
  };
}
