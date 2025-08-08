"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Settings, Shield, BarChart3, Link, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

// Match the exact structure from cli.js readSettings()
interface VibeKitSettings {
  sandbox: {
    enabled: boolean;
    type: string;
  };
  proxy: {
    enabled: boolean;
    redactionEnabled: boolean;
  };
  analytics: {
    enabled: boolean;
  };
  aliases: {
    enabled: boolean;
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<VibeKitSettings>({
    sandbox: {
      enabled: false,
      type: 'docker',
    },
    proxy: {
      enabled: true,
      redactionEnabled: true,
    },
    analytics: {
      enabled: true,
    },
    aliases: {
      enabled: false,
    },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/settings");
      if (response.ok) {
        const loadedSettings = await response.json();
        setSettings(loadedSettings);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newSettings: VibeKitSettings) => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newSettings),
      });

      if (response.ok) {
        setSettings(newSettings);
      } else {
        throw new Error("Failed to save settings");
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (category: keyof VibeKitSettings, setting: string) => {
    const newSettings = {
      ...settings,
      [category]: {
        ...settings[category],
        [setting]:
          !settings[category][
            setting as keyof (typeof settings)[typeof category]
          ],
      },
    };
    saveSettings(newSettings);
  };

  if (loading) {
    return (
      <div className="px-6 space-y-6">
        <div className="-mx-6 px-4 border-b flex h-12 items-center">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <h1 className="text-lg font-bold">Settings</h1>
          </div>
        </div>
        <div className="flex items-center justify-center min-h-[50vh]">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 space-y-6">
      <div className="-mx-6 px-4 border-b flex h-12 items-center">
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <h1 className="text-lg font-bold">Settings</h1>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Analytics Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              <CardTitle>Analytics</CardTitle>
            </div>
            <CardDescription>
              Control analytics collection and dashboard features
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="analytics-enabled">Enable Analytics</Label>
                <p className="text-sm text-muted-foreground">
                  Collect and store usage analytics for the dashboard
                </p>
              </div>
              <Switch
                id="analytics-enabled"
                checked={settings.analytics.enabled}
                onCheckedChange={() => handleToggle("analytics", "enabled")}
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>

        {/* Proxy Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle>Proxy Server</CardTitle>
            </div>
            <CardDescription>
              Configure proxy server and security settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="proxy-enabled">Enable Proxy</Label>
                <p className="text-sm text-muted-foreground">
                  Enable the proxy server functionality
                </p>
              </div>
              <Switch
                id="proxy-enabled"
                checked={settings.proxy.enabled}
                onCheckedChange={() => handleToggle("proxy", "enabled")}
                disabled={saving}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="redaction-enabled">Data Redaction</Label>
                <p className="text-sm text-muted-foreground">
                  Redact secrets, API keys, and sensitive data from coding agent output
                </p>
              </div>
              <Switch
                id="redaction-enabled"
                checked={settings.proxy.redactionEnabled}
                onCheckedChange={() =>
                  handleToggle("proxy", "redactionEnabled")
                }
                disabled={saving || !settings.proxy.enabled}
              />
            </div>
          </CardContent>
        </Card>

        {/* Sandbox Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              <CardTitle>Sandbox</CardTitle>
            </div>
            <CardDescription>
              Configure sandbox isolation for secure execution
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="sandbox-enabled">Enable Sandbox</Label>
                <p className="text-sm text-muted-foreground">
                  Enable sandbox isolation for secure command execution
                </p>
              </div>
              <Switch
                id="sandbox-enabled"
                checked={settings.sandbox.enabled}
                onCheckedChange={() => handleToggle("sandbox", "enabled")}
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>

        {/* Connect IDE Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Link className="h-5 w-5" />
              <CardTitle>Connect IDE</CardTitle>
            </div>
            <CardDescription>
              Create global command aliases for easier access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="aliases-enabled">Enable IDE Integration</Label>
                  {settings.aliases.enabled && (
                    <Badge variant="secondary" className="text-xs">
                      Requires restart
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Create global &quot;claude&quot; and &quot;gemini&quot;
                  commands
                </p>
              </div>
              <Switch
                id="aliases-enabled"
                checked={settings.aliases.enabled}
                onCheckedChange={() => handleToggle("aliases", "enabled")}
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {saving && (
        <div className="flex items-center justify-center p-4">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          <span className="text-sm text-muted-foreground">
            Saving settings...
          </span>
        </div>
      )}
    </div>
  );
}
