"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Projects" },
  { href: "/epc-discovery", label: "EPC Chat" },
  { href: "/epc-discovery/table", label: "EPC Table" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-slate-700 bg-slate-800">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="py-3 text-sm font-bold tracking-wide text-white"
        >
          Solar Lead Gen
        </Link>
        <div className="flex gap-1">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
