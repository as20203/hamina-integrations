"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { Button } from "@repo/ui/components/button";
import { Sheet, SheetContent, SheetTrigger } from "@repo/ui/components/sheet";
import { cn } from "@repo/ui/lib/utils";
import { LayoutGrid, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const sidebarNav = [
  { href: "/mist", label: "Site devices", icon: LayoutGrid, match: (p: string) => p === "/mist" || p.startsWith("/mist/") },
] as const;

const SidebarNavLinks = ({ onNavigate }: { onNavigate?: () => void }) => {
  const pathname = usePathname();

  return (
    <nav className="space-y-1 p-4">
      {sidebarNav.map((item) => {
        const Icon = item.icon;
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};

const AppSidebar = () => {
  const [isMobile] = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[230px] flex-col border-r bg-card lg:flex">
        <div className="border-b px-6 py-6">
          <Link href="/mist" className="block">
            <div className="text-xl font-bold tracking-tight text-foreground">Hamina</div>
            <div className="text-sm font-medium text-muted-foreground">Integrations</div>
          </Link>
        </div>
        <SidebarNavLinks />
      </aside>

      {isMobile ? (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="fixed left-4 top-4 z-40 lg:hidden"
              type="button"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(100vw,280px)] p-0">
            <div className="border-b px-6 py-6">
              <Link href="/mist" className="block" onClick={() => setMobileOpen(false)}>
                <div className="text-xl font-bold tracking-tight">Hamina</div>
                <div className="text-sm text-muted-foreground">Integrations</div>
              </Link>
            </div>
            <SidebarNavLinks onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
};

export { AppSidebar };
