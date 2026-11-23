import { useCallback, useState } from 'react';

export interface Selection {
  /** True while the list is in multi-select mode. */
  active: boolean;
  ids: ReadonlySet<string>;
  isSelected: (id: string) => boolean;
  /** Enters selection mode, optionally with `id` already selected (long-press). */
  start: (id?: string) => void;
  toggle: (id: string) => void;
  /** Selects every id in `all`, or clears the selection if they are all selected already. */
  toggleAll: (all: readonly string[]) => void;
  exit: () => void;
}

/** Multi-select state shared by the results list and the manage-searches list. */
export function useSelection(): Selection {
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());

  const start = useCallback((id?: string) => {
    setActive(true);
    setIds(new Set(id ? [id] : []));
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((all: readonly string[]) => {
    setIds((previous) => (previous.size === all.length ? new Set() : new Set(all)));
  }, []);

  const exit = useCallback(() => {
    setActive(false);
    setIds(new Set());
  }, []);

  const isSelected = useCallback((id: string) => ids.has(id), [ids]);

  return { active, ids, isSelected, start, toggle, toggleAll, exit };
}
