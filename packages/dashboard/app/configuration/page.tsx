"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Settings,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Shield,
  Database,
  Cpu,
  Activity,
  Globe,
  FileText,
  Zap
} from "lucide-react";

interface ConfigValue {
  value: any;
  lastModified: number;
  source: 'default' | 'file' | 'environment' | 'api';
}

interface ConfigSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  default?: any;
  min?: number;
  max?: number;
  enum?: any[];
  pattern?: string;
  description?: string;
  sensitive?: boolean;
}

interface CategoryConfig {
  category: string;
  configs: Record<string, any>;
  schemas?: Record<string, ConfigSchema>;
}

interface ConfigurationHealth {
  totalConfigs: number;
  validationErrors: string[];
  schemaViolations: number;
  watchers: number;
  lastReload: number;
  hotReloadEnabled: boolean;
}

const CATEGORY_ICONS = {
  system: Cpu,
  security: Shield,
  logging: FileText,
  resources: Database,
  error_handling: AlertTriangle,
  recovery: Activity,
  api: Globe,
  ui: Settings,
  integrations: Zap
};

const CATEGORY_DESCRIPTIONS = {
  system: "Core system configuration including port, environment, and basic settings",
  security: "Security-related settings like file permissions and path validation",
  logging: "Logging configuration including levels and output destinations",
  resources: "Resource limits and constraints for system operations",
  error_handling: "Error handling behavior and retry configurations",
  recovery: "Recovery mechanisms and checkpoint settings",
  api: "API configuration including timeouts and rate limits",
  ui: "User interface preferences and display settings",
  integrations: "Third-party integrations and external service settings"
};

export default function ConfigurationPage() {
  const [categories, setCategories] = useState<Record<string, CategoryConfig>>({});
  const [health, setHealth] = useState<ConfigurationHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('system');
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});

  const fetchConfigurations = async () => {
    try {
      setError(null);
      const response = await fetch('/api/config?schema=true');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch configurations');
      }
      
      setCategories(data.data.categories || {});
      setHealth(data.data.health);
    } catch (error) {
      console.error('Failed to fetch configurations:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = (category: string, key: string, value: any) => {
    const configKey = `${category}.${key}`;
    setEditedValues(prev => ({ ...prev, [configKey]: value }));
  };

  const handleSaveConfig = async (category: string, key: string) => {
    const configKey = `${category}.${key}`;
    const value = editedValues[configKey];
    
    if (value === undefined) return;

    try {
      setSaving(configKey);
      setError(null);
      setSuccess(null);

      // Validate before saving
      const validateResponse = await fetch('/api/config/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, key, value })
      });

      const validateData = await validateResponse.json();
      if (!validateData.data.valid) {
        throw new Error(validateData.data.errors.join(', '));
      }

      // Save the configuration
      const saveResponse = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, key, value, persist: true })
      });

      const saveData = await saveResponse.json();
      if (!saveResponse.ok) {
        throw new Error(saveData.error || 'Failed to save configuration');
      }

      // Update local state
      setCategories(prev => ({
        ...prev,
        [category]: {
          ...prev[category],
          configs: {
            ...prev[category].configs,
            [key]: value
          }
        }
      }));

      // Clear edited value
      setEditedValues(prev => {
        const newValues = { ...prev };
        delete newValues[configKey];
        return newValues;
      });

      setSuccess(`${key} saved successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Failed to save configuration:', error);
      setError(error instanceof Error ? error.message : 'Failed to save configuration');
    } finally {
      setSaving(null);
    }
  };

  const renderConfigInput = (category: string, key: string, currentValue: any, schema?: ConfigSchema) => {
    const configKey = `${category}.${key}`;
    const editedValue = editedValues[configKey];
    const value = editedValue !== undefined ? editedValue : currentValue;
    const hasChanges = editedValue !== undefined;

    if (schema?.type === 'boolean') {
      return (
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor={configKey}>{key}</Label>
            {schema.description && (
              <p className="text-sm text-muted-foreground">{schema.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={configKey}
              checked={value}
              onCheckedChange={(checked) => handleValueChange(category, key, checked)}
            />
            {hasChanges && (
              <Button
                size="sm"
                onClick={() => handleSaveConfig(category, key)}
                disabled={saving === configKey}
              >
                {saving === configKey ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
        </div>
      );
    }

    if (schema?.enum) {
      return (
        <div className="space-y-2">
          <Label htmlFor={configKey}>{key}</Label>
          {schema.description && (
            <p className="text-sm text-muted-foreground">{schema.description}</p>
          )}
          <div className="flex items-center gap-2">
            <Select
              value={String(value)}
              onValueChange={(newValue) => {
                const parsedValue = schema.type === 'number' ? Number(newValue) : newValue;
                handleValueChange(category, key, parsedValue);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {schema.enum.map((option) => (
                  <SelectItem key={String(option)} value={String(option)}>
                    {String(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasChanges && (
              <Button
                size="sm"
                onClick={() => handleSaveConfig(category, key)}
                disabled={saving === configKey}
              >
                {saving === configKey ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
        </div>
      );
    }

    const InputComponent = schema?.type === 'string' && schema.description?.includes('text') ? Textarea : Input;

    return (
      <div className="space-y-2">
        <Label htmlFor={configKey}>{key}</Label>
        {schema?.description && (
          <p className="text-sm text-muted-foreground">{schema.description}</p>
        )}
        <div className="flex items-center gap-2">
          <InputComponent
            id={configKey}
            type={schema?.type === 'number' ? 'number' : schema?.sensitive ? 'password' : 'text'}
            value={String(value)}
            onChange={(e) => {
              const newValue = schema?.type === 'number' ? Number(e.target.value) : e.target.value;
              handleValueChange(category, key, newValue);
            }}
            min={schema?.min}
            max={schema?.max}
            pattern={schema?.pattern}
            className="flex-1"
          />
          {hasChanges && (
            <Button
              size="sm"
              onClick={() => handleSaveConfig(category, key)}
              disabled={saving === configKey}
            >
              {saving === configKey ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
        {schema?.min !== undefined && schema?.max !== undefined && (
          <p className="text-xs text-muted-foreground">
            Range: {schema.min} - {schema.max}
          </p>
        )}
      </div>
    );
  };

  useEffect(() => {
    fetchConfigurations();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <h1 className="text-lg font-bold">Configuration Management</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto px-4">
          <Button variant="outline" size="sm" onClick={fetchConfigurations}>
            <RefreshCw className="mr-1 h-3 w-3" />
            Reload
          </Button>
        </div>
      </header>

      <div className="flex-1 space-y-6 p-2 sm:p-4 pt-0">
        {/* Status Messages */}
        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Health Overview */}
        {health && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Configuration Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Configs</p>
                  <p className="text-2xl font-bold">{health.totalConfigs}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Validation Errors</p>
                  <p className="text-2xl font-bold text-red-600">{health.validationErrors.length}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Watchers</p>
                  <p className="text-2xl font-bold">{health.watchers}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Hot Reload</p>
                  <Badge variant={health.hotReloadEnabled ? 'default' : 'secondary'}>
                    {health.hotReloadEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              </div>

              {health.validationErrors.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Validation Errors:</h4>
                  <div className="space-y-1">
                    {health.validationErrors.map((error, index) => (
                      <p key={index} className="text-sm text-red-600">{error}</p>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Configuration Categories */}
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-9">
            {Object.keys(categories).map((category) => {
              const Icon = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS] || Settings;
              return (
                <TabsTrigger key={category} value={category} className="flex items-center gap-1">
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{category}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {Object.entries(categories).map(([category, config]) => (
            <TabsContent key={category} value={category} className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {(() => {
                      const Icon = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS] || Settings;
                      return <Icon className="h-5 w-5" />;
                    })()}
                    {category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </CardTitle>
                  <CardDescription>
                    {CATEGORY_DESCRIPTIONS[category as keyof typeof CATEGORY_DESCRIPTIONS]}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {Object.entries(config.configs).map(([key, value]) => {
                      const schema = config.schemas?.[key];
                      return (
                        <div key={key} className="border-b pb-4 last:border-b-0">
                          {renderConfigInput(category, key, value, schema)}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}