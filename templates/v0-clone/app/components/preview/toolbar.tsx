import { Button } from "@/components/ui/button";
import { ExternalLink, Maximize2 } from "lucide-react";

export default function Toolbar() {
  return (
    <div className="flex items-center gap-2 p-2 border-b bg-background justify-between">
      {/* Left side - Home and Refresh */}
      <div className="flex items-center pl-2">
        <p className="text-sm font-medium">Preview</p>
      </div>

      {/* Right side - New Window and Fullscreen */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <ExternalLink className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
