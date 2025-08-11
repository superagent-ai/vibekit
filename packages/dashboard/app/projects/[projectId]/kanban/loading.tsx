import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";

export default function KanbanLoading() {
  return (
    <div className="px-6 space-y-6 h-screen overflow-auto">
      <div className="-mx-6 px-4 border-b flex h-12 items-center">
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <Skeleton className="h-6 w-32" />
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="flex gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1">
              <Skeleton className="h-8 w-full mb-2" />
              <div className="space-y-2">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}