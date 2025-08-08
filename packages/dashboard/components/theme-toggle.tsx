"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { SidebarMenuButton } from "@/components/ui/sidebar"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()

  return (
    <SidebarMenuButton
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      tooltip="Toggle theme"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span>Theme</span>
    </SidebarMenuButton>
  )
}