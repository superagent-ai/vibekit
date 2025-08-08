"use client";

import type * as React from "react";
import { ChartSpline, LucideGithub as Github, BookOpen, Palette, Info, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";

import { NavMain } from "@/components/nav-main";
import { ThemeToggle } from "@/components/theme-toggle";
import packageJson from "../package.json";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const getNavData = (pathname: string) => ({
  navMain: [
    {
      title: "Usage",
      url: "/",
      icon: ChartSpline,
      isActive: pathname === "/",
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings,
      isActive: pathname === "/settings",
    },
  ],
  footerLinks: [
    {
      title: "Github",
      url: "https://github.com/superagent-ai/vibekit",
      icon: Github,
    },
    {
      title: "Documentation",
      url: "https://docs.vibekit.com",
      icon: BookOpen,
    },
    {
      title: "Theme",
      url: "#",
      icon: Palette,
      isThemeToggle: true,
    },
    {
      title: `v${packageJson.version}`,
      url: "#",
      icon: Info,
      isVersion: true,
    },
  ],
});

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const data = getNavData(pathname);
  return (
    <TooltipProvider>
      <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/">
                <div className="bg-muted flex aspect-square size-4 items-center justify-center rounded-lg">
                  <span className="text-lg">🖖</span>
                </div>
                <div
                  className="grid flex-1 text-left leading-tight"
                  style={{ fontFamily: "helvetica, sans-serif" }}
                >
                  <span className="truncate text-md font-bold">VibeKit</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {data.footerLinks.map((link) => (
            <SidebarMenuItem key={link.title}>
              {link.isThemeToggle ? (
                <ThemeToggle />
              ) : link.isVersion ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton>
                      <link.icon className="text-muted-foreground" />
                      <span className="text-muted-foreground">{link.title}</span>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>VibeKit Version {packageJson.version}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <SidebarMenuButton asChild>
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    <link.icon />
                    <span>{link.title}</span>
                  </a>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
      </Sidebar>
    </TooltipProvider>
  );
}
