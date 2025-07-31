"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
}

const ColorPicker = React.forwardRef<HTMLInputElement, ColorPickerProps>(
  ({ className, value = "#000000", onChange, placeholder, ...props }, ref) => {
    const [color, setColor] = React.useState(value);

    React.useEffect(() => {
      setColor(value);
    }, [value]);

    const handleColorChange = (newColor: string) => {
      setColor(newColor);
      onChange?.(newColor);
    };

    return (
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="color"
            value={color}
            onChange={(e) => handleColorChange(e.target.value)}
            className="absolute inset-0 h-full opacity-0 cursor-pointer"
            {...props}
            ref={ref}
          />
          <div
            className="w-9 h-9 rounded-md border border-input cursor-pointer"
            style={{ backgroundColor: color }}
          />
        </div>
        <Input
          type="text"
          value={color}
          onChange={(e) => handleColorChange(e.target.value)}
          placeholder={placeholder || "#000000"}
          className={cn("font-mono w-fit", className)}
          pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
        />
      </div>
    );
  }
);

ColorPicker.displayName = "ColorPicker";

export { ColorPicker };
