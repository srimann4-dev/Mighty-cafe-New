import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { createMenuItem, getAllMenuItems, updateMenuItem } from '@/db/repository';
import type { MenuItem } from '@/types';

export function useProducts() {
  const db = useSQLiteContext();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    const rows = await getAllMenuItems(db);
    setMenuItems(rows);
    setIsLoading(false);
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  const saveMenuItem = useCallback(
    async (payload: Pick<MenuItem, 'id' | 'name' | 'price' | 'purchaseCost' | 'category' | 'isActive' | 'barcode'>) => {
      if (payload.id) {
        await updateMenuItem(db, payload);
      } else {
        await createMenuItem(db, payload);
      }
      await reload();
    },
    [db, reload],
  );

  return {
    menuItems,
    isLoading,
    reload,
    saveMenuItem,
  };
}
