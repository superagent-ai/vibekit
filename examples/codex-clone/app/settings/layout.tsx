"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings, Globe, Shield, User, ChevronLeft, ChevronRight, Home } from "lucide-react";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  const tabs = [
    { id: "home", label: "Home", href: "/", icon: Home },
    { id: "general", label: "General", href: "/settings", icon: Settings },
    { id: "environments", label: "Environments", href: "/settings/environments", icon: Globe },
    { id: "data-controls", label: "Data controls", href: "/settings/data-controls", icon: Shield },
    { id: "account", label: "Account", href: "/settings/account", icon: User },
  ];

  const activeTab = pathname === "/" ? "home" :
                   pathname === "/settings" ? "general" : 
                   pathname.includes("/environments") ? "environments" :
                   pathname.includes("/data-controls") ? "data-controls" :
                   pathname.includes("/account") ? "account" : "general";

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`${isCollapsed ? 'w-24' : 'w-64'} border-r bg-muted/30 flex flex-col transition-all duration-300`}>
          <div className="p-4">
            {/* Collapse/Expand Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={`mb-6 ${isCollapsed ? 'w-12 h-12 p-0' : 'w-full'} flex items-center justify-center transition-all duration-300`}
            >
              {isCollapsed ? <ChevronRight className="h-6 w-6 transition-all duration-300" /> : <ChevronLeft className="h-6 w-6 transition-all duration-300" />}
            </Button>
            
            <nav className="space-y-3">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                
                if (isCollapsed) {
                  return (
                    <Tooltip key={tab.id}>
                      <TooltipTrigger asChild>
                        <Link href={tab.href}>
                          <Button
                            variant={isActive ? "secondary" : "ghost"}
                            size="sm"
                            className="w-20 h-20 p-0 flex items-center justify-center transition-all duration-300"
                          >
                            <Icon className="h-14 w-14 transition-all duration-300" />
                          </Button>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{tab.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                
                return (
                  <Link key={tab.id} href={tab.href}>
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      className="w-full justify-start gap-4 h-16 transition-all duration-300"
                    >
                      <Icon className="h-10 w-10 transition-all duration-300" />
                      <span className="text-lg transition-opacity duration-300">{tab.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}