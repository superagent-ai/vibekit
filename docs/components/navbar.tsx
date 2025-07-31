"use client";

import { useUser, useAuth } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, createContext, useContext } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config";

// Create context for sidebar state
const SidebarContext = createContext<{
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}>({
  sidebarOpen: false,
  setSidebarOpen: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SidebarContext.Provider value={{ sidebarOpen, setSidebarOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export default function Navbar() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const { sidebarOpen, setSidebarOpen } = useSidebar();
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href;

  // Handle escape key to close sidebar
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [sidebarOpen, setSidebarOpen]);

  // Create initials for avatar fallback
  const getInitials = () => {
    if (!user) return "?";

    const firstName = user.firstName || "";
    const lastName = user.lastName || "";

    if (!firstName && !lastName) return "?";

    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  return (
    <>
      <div className="h-12 px-2 flex items-center justify-between fixed top-0 left-0 right-0 z-50 backdrop-blur">
        <div className="flex items-center gap-x-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="transition-colors hover:bg-background hover:border cursor-pointer ml-1"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? (
              <Image
                src="/sidebar-open.svg"
                alt="Open sidebar"
                width={22}
                height={22}
                className="opacity-50 transform rotate-y-180"
              />
            ) : (
              <Image
                src="/sidebar-open.svg"
                alt="Open sidebar"
                width={22}
                height={22}
                className="opacity-50"
              />
            )}
          </Button>

          <div className="flex items-center gap-x-2 ml-2 text-muted-foreground">
            <Image src="/mark.png" alt="Superagent" width={20} height={20} />
            <p className="font-medium">VibeKit Onboard</p>
          </div>
        </div>
      </div>
      {/* Sidebar */}
      <div
        className={cn(
          "fixed top-10  left-0 h-[calc(100vh-3rem)] z-30 transition-all duration-300 ease-in-out",
          sidebarOpen ? "w-40" : "w-16"
        )}
      >
        <div className="p-2 flex flex-col h-full justify-between">
          <div className="flex flex-col gap-y-1">
            {siteConfig.mainNav.map((item) => (
              <Link href={item.href} key={item.title} className="w-full">
                <Button
                  variant={isActive(item.href) ? "outline" : "ghost"}
                  className={cn(
                    "transition-all duration-300 ease-in-out w-full ml-1 hover:bg-background border border-transparent hover:border-muted-foreground/20 cursor-pointer opacity-50 hover:opacity-100 justify-start",
                    sidebarOpen ? "px-1.5 pr-4" : "px-1.5 w-9",
                    isActive(item.href) &&
                      "opacity-100 border-muted-foreground/20"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Image
                      src={item.icon as string}
                      alt={item.title}
                      width={22}
                      height={22}
                      className="flex-shrink-0"
                    />
                    <span
                      className={cn(
                        "font-medium transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap text-[16px]",
                        sidebarOpen ? "opacity-100 w-auto" : "opacity-0 w-0"
                      )}
                    >
                      {item.title}
                    </span>
                  </div>
                </Button>
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-y-1">
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Avatar className="cursor-pointer ml-1">
                    <AvatarImage
                      src={user.imageUrl}
                      alt={user.fullName || user.emailAddresses[0].emailAddress}
                    />
                    <AvatarFallback>{getInitials()}</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="text-md font-medium">
                    My Account
                    <p className="text-sm font-normal text-muted-foreground">
                      {user.emailAddresses[0].emailAddress}
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <Link href="/profile" passHref>
                    <DropdownMenuItem className="text-md">
                      Profile
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/billing" passHref>
                    <DropdownMenuItem className="text-md">
                      Billing
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-md"
                    onClick={() => signOut()}
                  >
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
