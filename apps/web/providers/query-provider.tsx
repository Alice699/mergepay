"use client";

import type { ReactNode } from "react";

export function QueryProvider({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
