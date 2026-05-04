import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { getDashboardMetrics, getLowStockItems, getSaleItemsBySaleIds, getSales, getStaff, getCashDrawerSummary } from '@/db/repository';
import type { DashboardMetrics, DateRange, InventoryItem, Sale, SaleItem, StaffMember } from '@/types';
import { getTodayIsoDate, offsetDateByDays } from '@/utils/date';

interface CashDrawerSummary {
  openingBalance: number;
  currentBalance: number;
  totalCashSales: number;
  totalChangeGiven: number;
}

export function useReports() {
  const db = useSQLiteContext();
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: offsetDateByDays(-6),
    endDate: getTodayIsoDate(),
  });
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalSales: 0,
    totalOrders: 0,
    cashSales: 0,
    upiSales: 0,
    averageOrderValue: 0,
    totalCost: 0,
    estimatedProfit: 0,
  });
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItems, setSaleItems] = useState<Record<string, SaleItem[]>>({});
  const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [cashDrawer, setCashDrawer] = useState<CashDrawerSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    const [metricsResult, salesResult, lowStockResult, staffResult, drawerResult] = await Promise.all([
      getDashboardMetrics(db, dateRange),
      getSales(db, dateRange),
      getLowStockItems(db),
      getStaff(db),
      getCashDrawerSummary(db, getTodayIsoDate()),
    ]);

    const saleItemMap = await getSaleItemsBySaleIds(
      db,
      salesResult.map((sale) => sale.id),
    );

    setMetrics(metricsResult);
    setSales(salesResult);
    setSaleItems(saleItemMap);
    setLowStockItems(lowStockResult);
    setStaff(staffResult);
    setCashDrawer(drawerResult);
    setIsLoading(false);
  }, [dateRange, db]);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    dateRange,
    setDateRange,
    metrics,
    sales,
    saleItems,
    lowStockItems,
    staff,
    cashDrawer,
    isLoading,
    reload,
  };
}
