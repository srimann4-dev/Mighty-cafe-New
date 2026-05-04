import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { getStaff } from '@/db/repository';
import { useAppStore } from '@/store/useAppStore';
import type { StaffMember } from '@/types';

export function useBootstrap() {
  const db = useSQLiteContext();
  const bootstrapStaffSelection = useAppStore((state) => state.bootstrapStaffSelection);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const result = await getStaff(db);
      if (!isMounted) {
        return;
      }

      setStaff(result);
      bootstrapStaffSelection(result.filter((member) => member.isActive === 1));
      setIsLoading(false);
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [bootstrapStaffSelection, db]);

  return { staff, isLoading };
}
