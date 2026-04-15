"use client";

import { usePathname } from "next/navigation";
import { useSidebar } from "./SidebarContext";

export default function MainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const pathname = usePathname();

  // Public share pages render full-bleed without the app chrome
  const isBareRoute = pathname?.startsWith("/share/") ?? false;

  if (isBareRoute) {
    return <div className="min-h-screen bg-surface-primary">{children}</div>;
  }

  return (
    <div
      className={`min-h-screen bg-surface-primary pt-12 transition-all duration-200 lg:pt-0 ${
        collapsed ? "lg:ml-16" : "lg:ml-56"
      }`}
    >
      {children}
    </div>
  );
}
