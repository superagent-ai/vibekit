import { Dot } from "lucide-react";
import Link from "next/link";

import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function Navbar() {
  return (
    <div className="flex justify-between items-center">
      <Link href="/" passHref>
        <h1 className="text-lg font-bold">CloneDex</h1>
      </Link>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0">
          <Link
            href="/"
            className="hover:opacity-45 transition-opacity duration-300"
          >
            Home
          </Link>
          <Dot className="text-muted-foreground/40" />
          <Link
            href="/environments"
            className="hover:opacity-45 transition-opacity duration-300"
          >
            Environments
          </Link>
          <Dot className="text-muted-foreground/40" />
          <Link
            href="/settings"
            className="hover:opacity-45 transition-opacity duration-300"
          >
            Settings
          </Link>
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}
