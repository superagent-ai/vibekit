"use client";

import { Container, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  const { theme, setTheme } = useTheme();

  return (
    <nav className="flex items-center justify-between p-4 border-b bg-card">
      <div className="flex items-center gap-3">
        <Container className="h-8 w-8 text-blue-500" />
        <div>
          <h1 className="text-xl font-bold">Claude Docker</h1>
          <p className="text-sm text-muted-foreground">
            AI Code Generation with Local Docker
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </div>
    </nav>
  );
}