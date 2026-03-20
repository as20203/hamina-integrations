import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@repo/ui/globals.css";

export const metadata: Metadata = {
  title: "Hamina Frontend",
  description: "Hamina integrations frontend app",
};

type RootLayoutProps = {
  children: ReactNode;
};

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
};

export default RootLayout;
