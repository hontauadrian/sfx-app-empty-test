'use client';

import { useCallback, useState, type ReactNode } from 'react';
import type { ActiveBrandSelectorProps } from './types';

export function ActiveBrandSelector({
  selectLabel,
  currentBrandName,
  options,
  createBrandLabel,
  onSelect,
  onCreate,
}: ActiveBrandSelectorProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = useCallback((): void => {
    setIsOpen((current) => !current);
  }, []);

  const handleSelect = useCallback(
    (id: string): void => {
      setIsOpen(false);
      onSelect(id);
    },
    [onSelect],
  );

  const handleCreate = useCallback((): void => {
    setIsOpen(false);
    onCreate();
  }, [onCreate]);

  const buttonLabel = currentBrandName ?? selectLabel;

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={selectLabel}
        className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        onClick={handleToggle}
      >
        {buttonLabel}
      </button>
      {isOpen ? (
        <ul
          role="listbox"
          aria-label={selectLabel}
          className="absolute left-1/2 mt-2 w-64 -translate-x-1/2 overflow-hidden rounded-md border border-border bg-card text-sm shadow"
        >
          {options.map((option) => (
            <li key={option.id} role="option" aria-selected={option.name === currentBrandName}>
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-foreground hover:bg-muted"
                onClick={(): void => handleSelect(option.id)}
              >
                {option.name}
              </button>
            </li>
          ))}
          <li role="separator" className="border-t border-border" />
          <li>
            <button
              type="button"
              className="block w-full px-4 py-2 text-left font-medium text-primary hover:bg-muted"
              onClick={handleCreate}
            >
              {createBrandLabel}
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
