import { BRAND_PRODUCT_SECTIONS } from '@/config/productCategories';
import type { ProductSection } from '@/db/repository';
import type { MenuItem } from '@/types';

export const SECTION_PALETTE = ['#E67E22', '#9B59B6', '#27AE60', '#E74C3C', '#2980B9', '#F39C12', '#1ABC9C', '#16A085'];

export type DisplaySection = {
  name: string;
  category: string;
  icon: string;
  color: string;
  dbId?: string;
};

export function buildDisplaySections(
  dbSections: ProductSection[],
  menuItems: MenuItem[],
): DisplaySection[] {
  const builtInCategories = new Set(BRAND_PRODUCT_SECTIONS.map((s) => s.category));
  const allSections: DisplaySection[] = [
    ...BRAND_PRODUCT_SECTIONS,
    ...dbSections
      .filter((s) => !builtInCategories.has(s.category))
      .map((s) => ({ name: s.name, category: s.category, icon: s.icon, color: s.color, dbId: s.id })),
  ];

  const knownCats = new Set(allSections.map((s) => s.category));
  const autoSections = Array.from(
    new Set(
      menuItems
        .filter((item) => item.fulfillmentType === 'pre_made' && !knownCats.has(item.category))
        .map((item) => item.category),
    ),
  ).map((cat, i) => ({
    name: cat,
    category: cat,
    icon: 'tag-outline',
    color: SECTION_PALETTE[i % SECTION_PALETTE.length],
  }));

  return [...allSections, ...autoSections];
}

export function partitionMenuItems(menuItems: MenuItem[], sections: DisplaySection[]) {
  const brandCategories = new Set(sections.map((s) => s.category));
  return {
    brandCategories,
    readyToSellItems: menuItems.filter((item) => brandCategories.has(item.category)),
    cafeMenuItems: menuItems.filter((item) => !brandCategories.has(item.category)),
  };
}
