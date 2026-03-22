"use client";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

type MainLayoutProps = {
  children: ReactNode;
};

const MainLayout = ({ children }: MainLayoutProps) => {
  return (
    <div className="min-h-screen bg-muted/50">
      <AppSidebar />
      <main
        className={cn(
          "min-h-screen pb-10 pl-4 pr-4 pt-16 lg:pl-[calc(230px+1.5rem)] lg:pr-8 lg:pt-8"
        )}
      >
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
};

export default MainLayout;
