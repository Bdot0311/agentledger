"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/queue", label: "Approval queue" },
  { href: "/app/log", label: "Audit log" },
  { href: "/app/policies", label: "Policies" },
  { href: "/app/facts", label: "Fact sheet" },
  { href: "/app/settings", label: "Settings" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 md:flex-col">
      {LINKS.map((l) => {
        const active = l.href === "/app" ? path === "/app" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn("rounded-md px-3 py-1.5 text-sm hover:bg-accent", active && "bg-accent font-medium")}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
