"use client";
import { Loader2 } from "lucide-react";
import { useSidebar } from "@/components/navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function Loading() {
  const { sidebarOpen } = useSidebar();
  return (
    <div
      className={cn(
        "flex-1 transition-all duration-300 ease-in-out border bg-background mt-12 mb-4 mr-5 rounded-2xl",
        sidebarOpen ? "ml-42" : "ml-14.5"
      )}
    >
      <div className="w-full p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="w-24 h-6 ml-2" />
          </div>
          <div className="flex items-center gap-3"></div>
        </div>
      </div>
      <div className="flex justify-center items-center mt-[25%]">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
