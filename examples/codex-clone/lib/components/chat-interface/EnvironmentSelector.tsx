"use client";

import React, { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEnvironmentStore } from "@/stores/environments";
import { Server, Monitor, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

interface EnvironmentSelectorProps {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  showDesktopOption?: boolean;
  className?: string;
}

export function EnvironmentSelector({
  value,
  onChange,
  disabled = false,
  showDesktopOption = true,
  className,
}: EnvironmentSelectorProps) {
  const { environments, getDefaultEnvironment } = useEnvironmentStore();
  const router = useRouter();

  // Auto-select default environment
  useEffect(() => {
    if (!value && onChange) {
      const defaultEnv = getDefaultEnvironment();
      if (defaultEnv) {
        onChange(defaultEnv.id);
      } else if (environments.length > 0) {
        onChange(environments[0].id);
      }
    }
  }, [value, environments, getDefaultEnvironment, onChange]);

  const handleChange = (newValue: string) => {
    if (newValue === "add-new") {
      router.push("/settings/environments");
    } else if (onChange) {
      onChange(newValue);
    }
  };

  if (environments.length === 0 && !showDesktopOption) {
    return null;
  }

  return (
    <Select
      value={value}
      onValueChange={handleChange}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4" />
          <SelectValue placeholder="Select environment" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {showDesktopOption && (
          <SelectItem value="desktop">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              <span>Desktop</span>
            </div>
          </SelectItem>
        )}
        
        {environments.map((env) => (
          <SelectItem key={env.id} value={env.id}>
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              <span>{env.name}</span>
              {env.isDefault && (
                <span className="text-xs text-muted-foreground">(default)</span>
              )}
            </div>
          </SelectItem>
        ))}
        
        <SelectItem value="add-new">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Plus className="h-4 w-4" />
            <span>Add Environment...</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}