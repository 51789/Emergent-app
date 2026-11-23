import { CATEGORY_IDS, type CategoryId } from '@/api/types';

import type { IconName } from './icons';

export interface CategoryDefinition {
  id: CategoryId;
  icon: IconName;
}

/** The eight search categories, in display order. Labels live in the i18n files (`categories.<id>`). */
export const CATEGORIES: readonly CategoryDefinition[] = [
  { id: 'immobili', icon: 'home' },
  { id: 'bandi', icon: 'description' },
  { id: 'auto_moto', icon: 'directions-car' },
  { id: 'gare_appalto', icon: 'gavel' },
  { id: 'divertimento', icon: 'celebration' },
  { id: 'finanza', icon: 'trending-up' },
  { id: 'nuove_leggi', icon: 'policy' },
  { id: 'lavoro', icon: 'work' },
];

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && (CATEGORY_IDS as readonly string[]).includes(value);
}

export function getCategory(id: string): CategoryDefinition | undefined {
  return CATEGORIES.find((category) => category.id === id);
}
