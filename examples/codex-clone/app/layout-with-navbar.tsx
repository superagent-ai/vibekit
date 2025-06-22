"use client";
import { usePathname } from "next/navigation";
import Navbar from "@/components/navbar";
import { BackgroundEffects } from "@/components/background-effects";

export default function LayoutWithNavbar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Pages where navbar should NOT appear
  const hideNavbarPaths = [
    "/auth",
    "/task", // Task pages have their own navbar
  ];
  
  // Check if current path should hide navbar
  const shouldHideNavbar = hideNavbarPaths.some(path => pathname.startsWith(path));
  
  // Use vibrant background for all pages
  const getBackgroundVariant = () => {
    return "vibrant";
  };
  
  return (
    <>
      <BackgroundEffects variant={getBackgroundVariant() as "default" | "vibrant" | "subtle"} />
      {!shouldHideNavbar && (
        <header className="sticky top-0 z-50 w-full backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="w-full px-6 h-14">
            <Navbar />
          </div>
        </header>
      )}
      {children}
    </>
  );
}