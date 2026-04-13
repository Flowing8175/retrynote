import { useState } from 'react';

interface BooleanModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

interface ValueModalState<T> {
  value: T | null;
  isOpen: boolean;
  open: (val: T) => void;
  close: () => void;
}

export function useModalState(): BooleanModalState;
export function useModalState<T>(): ValueModalState<T>;
export function useModalState<T>() {
  const [value, setValue] = useState<T | true | null>(null);

  const isOpen = value !== null;

  const open = (val?: T) => setValue(val !== undefined ? val : (true as true));
  const close = () => setValue(null);
  const toggle = () => setValue((prev) => (prev !== null ? null : (true as true)));

  return { value: value as T | null, isOpen, open, close, toggle };
}
