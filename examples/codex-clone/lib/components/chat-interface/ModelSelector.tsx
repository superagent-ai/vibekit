"use client";

import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot } from "lucide-react";
import { useRouter } from "next/navigation";

interface ModelSelectorProps {
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ModelSelector({
  value,
  onChange,
  disabled = false,
  className,
}: ModelSelectorProps) {
  const router = useRouter();

  const handleChange = (newValue: string) => {
    if (newValue === "custom") {
      router.push("/settings/environments");
    } else if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <Select
      value={value}
      onValueChange={handleChange}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="lfg-1">LFG-1</SelectItem>
        <SelectItem value="custom">CUSTOM...</SelectItem>
      </SelectContent>
    </Select>
  );
}