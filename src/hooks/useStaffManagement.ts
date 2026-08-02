import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { createStaff, getStaff, softDeleteStaff, updateStaff } from '@/db/repository';
import type { StaffMember } from '@/types';

export function useStaffManagement() {
  const db = useSQLiteContext();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    const result = await getStaff(db);
    setStaff(result);
    setIsLoading(false);
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  const addStaff = useCallback(
    async (payload: Pick<StaffMember, 'name' | 'role' | 'phone' | 'attendancePin'>) => {
      await createStaff(db, payload);
      await reload();
    },
    [db, reload],
  );

  const editStaff = useCallback(
    async (payload: Pick<StaffMember, 'id' | 'name' | 'role' | 'phone' | 'attendancePin'>) => {
      await updateStaff(db, payload);
      await reload();
    },
    [db, reload],
  );

  const deleteStaff = useCallback(
    async (staffId: string) => {
      await softDeleteStaff(db, staffId);
      await reload();
    },
    [db, reload],
  );

  return {
    staff,
    isLoading,
    addStaff,
    editStaff,
    deleteStaff,
    reload,
  };
}
