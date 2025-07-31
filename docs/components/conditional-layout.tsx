"use client";

import { usePathname } from "next/navigation";
import Navbar, { SidebarProvider } from "@/components/navbar";

interface ConditionalLayoutProps {
  children: React.ReactNode;
}

export default function ConditionalLayout({
  children,
}: ConditionalLayoutProps) {
  const pathname = usePathname();
  const isEmbedRoute = pathname.startsWith("/embed/");

  if (isEmbedRoute) {
    return <div className="flex flex-col h-screen bg-muted">{children}</div>;
  }

  return (
    <SidebarProvider>
      <div className="flex flex-col h-screen bg-muted">
        <Navbar />
        {children}
      </div>
    </SidebarProvider>
  );
}
