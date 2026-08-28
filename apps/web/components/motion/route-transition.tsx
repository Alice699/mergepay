"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface RouteTransitionProps {
  children: ReactNode;
}

export function RouteTransition({ children }: RouteTransitionProps) {
  const pathname = usePathname();

  return (
    <div className="route-transition" key={pathname}>
      <span aria-hidden="true" className="route-transition__rail" />
      <div className="route-transition__content">{children}</div>
    </div>
  );
}
