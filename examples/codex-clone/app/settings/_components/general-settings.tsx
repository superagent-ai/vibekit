"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

export default function GeneralSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  // Application settings state
  const [autoSave, setAutoSave] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('autoSave') !== 'false';
    }
    return true;
  });
  
  const [realTimeUpdates, setRealTimeUpdates] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('realTimeUpdates') !== 'false';
    }
    return true;
  });
  
  const [notifications, setNotifications] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load notification settings after mount
    if (typeof window !== 'undefined') {
      const savedNotifications = localStorage.getItem('notifications') === 'true';
      setNotifications(savedNotifications);
    }
  }, []);
  
  // Save settings to localStorage when they change
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('autoSave', String(autoSave));
    }
  }, [autoSave, mounted]);
  
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('realTimeUpdates', String(realTimeUpdates));
    }
  }, [realTimeUpdates, mounted]);
  
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('notifications', String(notifications));
    }
  }, [notifications, mounted]);
  
  const themeOptions = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">General</h2>
        <p className="text-muted-foreground">
          Manage your general application preferences and settings.
        </p>
      </div>

      {/* Theme Selection */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium mb-2">Theme</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Choose how the application looks to you.
          </p>
        </div>
        
        <div className="grid grid-cols-3 gap-4 max-w-md">
          {themeOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = mounted && theme === option.value;
            
            return (
              <Button
                key={option.value}
                variant={isSelected ? "default" : "outline"}
                className="h-auto p-4 flex flex-col items-center gap-2"
                onClick={() => setTheme(option.value)}
                disabled={!mounted}
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm">{option.label}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Application Settings */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium mb-2">Application</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Configure how the application behaves.
          </p>
        </div>
        
        <div className="space-y-6 max-w-md">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="font-medium">Auto-save tasks</div>
              <div className="text-sm text-muted-foreground">
                Automatically save your task progress
              </div>
            </div>
            <Switch
              checked={autoSave}
              onCheckedChange={setAutoSave}
              disabled={!mounted}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="font-medium">Real-time updates</div>
              <div className="text-sm text-muted-foreground">
                Show live task execution progress
              </div>
            </div>
            <Switch
              checked={realTimeUpdates}
              onCheckedChange={setRealTimeUpdates}
              disabled={!mounted}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="font-medium">Notifications</div>
              <div className="text-sm text-muted-foreground">
                Get notified when tasks complete
              </div>
            </div>
            <Switch
              checked={notifications}
              onCheckedChange={setNotifications}
              disabled={!mounted}
            />
          </div>
        </div>
      </div>
    </div>
  );
}