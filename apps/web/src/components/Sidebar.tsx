"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/overview", label: "Overview" },
  { href: "/command", label: "Command Center" },
  { href: "/tasks", label: "Tasks" },
  { href: "/automations", label: "Automations" },
  { href: "/agents", label: "Agents" },
  { href: "/approvals", label: "Approvals" },
  { href: "/integrations", label: "Integrations" },
  { href: "/costs", label: "Costs" },
  { href: "/logs", label: "Logs" },
  { href: "/incidents", label: "Incidents" },
  { href: "/settings", label: "Settings" },
];

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "MK AI Command Center";

export function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const links = (
    <nav aria-label="Main navigation" className="space-y-0.5">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-accent/15 font-medium text-accent"
                : "text-ink-muted hover:bg-bg-raised/70 hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/15 bg-bg-base/90 px-4 py-3 backdrop-blur md:hidden">
        <span className="text-sm font-semibold">{APP_NAME}</span>
        <button
          type="button"
          className="btn"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>
      {open ? (
        <div id="mobile-nav" className="border-b border-line/15 bg-bg-surface p-3 md:hidden">
          {links}
          <button type="button" onClick={logout} className="btn mt-2 w-full">
            Sign out ({userName})
          </button>
        </div>
      ) : null}

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line/15 bg-bg-surface/60 p-4 backdrop-blur md:flex">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-sm font-bold text-accent">
            MK
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{APP_NAME}</p>
            <p className="truncate text-xs text-ink-faint">{userName}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{links}</div>
        <button type="button" onClick={logout} className="btn mt-4 w-full">
          Sign out
        </button>
      </aside>
    </>
  );
}
