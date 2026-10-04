import { useSyncExternalStore } from 'react';
import { getU65SelectedProduct, subscribeU65Product, selectU65Product } from '../lib/u65ProductSelection.js';
export function useU65ProductSelection() {
  const id = useSyncExternalStore(subscribeU65Product, getU65SelectedProduct, () => null);
  return [id, selectU65Product];
}
