"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <DropdownMenuItem disabled>
        <Sun className="mr-2 h-4 w-4" />
        Toggle theme
      </DropdownMenuItem>
    );
  }

  const isDark = theme === "dark";

  return (
    <DropdownMenuItem
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="font-medium"
    >
      {isDark ? (
        <>
          <Sun className="mr-2 h-4 w-4" />
          Light mode
        </>
      ) : (
        <>
          <Moon className="mr-2 h-4 w-4" />
          Dark mode
        </>
      )}
    </DropdownMenuItem>
  );
}
