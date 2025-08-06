"use client";

import { ExternalLink, Maximize2 } from "lucide-react";
import { useRef, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import BootingMachine from "../booting-machine";
import { Doc } from "@/convex/_generated/dataModel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Files from "./code";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Preview({ session }: { session?: Doc<"sessions"> }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isUrlAvailable, setIsUrlAvailable] = useState(false);

  useEffect(() => {
    const intervalRef = { current: null as NodeJS.Timeout | null };
    const checkUrlAvailability = async () => {
      if (session?.tunnelUrl) {
        try {
          console.log("Checking URL availability", session.tunnelUrl);
          const response = await fetch("/api/check-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: session.tunnelUrl }),
          });
          const data = await response.json();
          setIsUrlAvailable(data.available);
          if (data.available && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        } catch (error) {
          console.error("Error checking URL availability:", error);
          setIsUrlAvailable(false);
        }
      }
    };

    checkUrlAvailability(); // Initial check
    intervalRef.current = setInterval(checkUrlAvailability, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session?.tunnelUrl]);

  // Check if the tunnel URL is available
  return (
    <div className="w-full bg-muted rounded-lg border overflow-hidden flex flex-col">
      <Tabs defaultValue="preview" className="h-full gap-0">
        <div className="flex items-center p-2 border-b bg-background justify-between">
          {/* Left side - Home and Refresh */}
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
          </TabsList>

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
        <TabsContent value="preview" className="flex-1 h-full">
          <div className="flex-1 h-full overflow-hidden relative">
            {session?.tunnelUrl && isUrlAvailable ? (
              <iframe
                ref={iframeRef}
                src={session.tunnelUrl}
                className="w-full h-full border-none"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <div className="max-w-xs rounded-lg h-[200px] mx-auto w-full flex items-center justify-center">
                  <BootingMachine
                    label={
                      session?.tunnelUrl && !isUrlAvailable
                        ? "GENERATING PREVIEW"
                        : (session?.status?.replace(/_/g, " ") ??
                          "BOOTING MACHINE")
                    }
                    size="lg"
                  />
                </div>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="code" className="flex-1 overflow-hidden">
          <ScrollArea className="h-[calc(100%-0px)]">
            <Files session={session!} />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
