import { useRef, useEffect } from "react";
import { TextShimmer } from "./ui/text-shimmer";
import { Loader } from "lucide-react";

export default function BootingMachine({
  label,
  size = "md",
}: {
  label: string;
  size?: "md" | "lg";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const generateStatic = () => {
      const imageData = ctx.createImageData(canvas.width, canvas.height);
      const data = imageData.data;

      // Adjust static intensity based on size
      const staticThreshold = size === "lg" ? 0.3 : 0.5; // lg = more white noise

      for (let i = 0; i < data.length; i += 4) {
        const random = Math.random();
        let noise;

        if (random > staticThreshold) {
          noise = 255; // white
        } else if (random > staticThreshold - 0.2) {
          noise = size === "lg" ? Math.floor(Math.random() * 100) + 155 : 128; // light gray with variation
        } else {
          noise = size === "lg" ? Math.floor(Math.random() * 80) + 50 : 64; // dark gray with variation
        }

        data[i] = noise; // red
        data[i + 1] = noise; // green
        data[i + 2] = noise; // blue
        data[i + 3] = 255; // fully opaque
      }

      ctx.putImageData(imageData, 0, 0);
    };

    // Adjust animation speed based on size
    const animationSpeed = size === "lg" ? 30 : 50; // lg = faster updates
    const interval = setInterval(generateStatic, animationSpeed);
    generateStatic(); // Initial render

    return () => clearInterval(interval);
  }, [size]);

  return (
    <div className="w-auto px-4 rounded-full h-12 border border-muted-foreground/30 bg-background relative overflow-hidden flex items-center justify-center gap-x-2">
      <Loader className="size-4 animate-spin text-muted-foreground" />
      <div className="flex items-center gap-x-1">
        <span className="text-xs font-mono text-orange-500">SANDBOX:</span>
        <TextShimmer className=" text-xs font-mono">{label}</TextShimmer>
      </div>
    </div>
  );
}
