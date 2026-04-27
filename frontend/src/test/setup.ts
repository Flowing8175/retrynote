import '@testing-library/jest-dom';
import { vi } from 'vitest';

// URL.createObjectURL / revokeObjectURL mock for viewer tests
if (typeof globalThis.URL.createObjectURL === 'undefined') {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  globalThis.URL.revokeObjectURL = vi.fn();
}
