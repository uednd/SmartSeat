'use client';

import { ToastProvider } from './toast';
import type { ReactNode } from 'react';

export function ClientToastProvider({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
