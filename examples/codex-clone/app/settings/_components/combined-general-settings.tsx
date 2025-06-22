"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun, Search, Type, Code, Hash, Check, Loader2, RefreshCw, Palette, Bell } from "lucide-react";
import { useFontStore } from "@/stores/fonts";
import { Separator } from "@/components/ui/separator";
import { NotificationService } from "@/lib/utils/notifications";

interface Font {
  family: string;
  category: string;
  variants: string[];
  subsets: string[];
  isRegular: boolean;
  isMono: boolean;
  isDisplay: boolean;
}

type FontCategory = "headings" | "body" | "code";

const PREVIEW_TEXT = {
  heading: "The Quick Brown Fox Jumps Over",
  body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  code: `function hello() {
  return "Hello World";
}`
};

const FONT_SIZE_MAP = {
  headings: {
    sm: { h1: 'text-xl', h2: 'text-base' },
    md: { h1: 'text-2xl', h2: 'text-lg' },
    lg: { h1: 'text-3xl', h2: 'text-xl' },
    xl: { h1: 'text-4xl', h2: 'text-2xl' }
  },
  body: {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg'
  },
  code: {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg'
  }
} as const;

export default function CombinedGeneralSettings() {
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
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // Font settings state
  const [fonts, setFonts] = useState<Font[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<FontCategory>("headings");
  const [applying, setApplying] = useState(false);
  
  const { fontSettings, fontSizes, setFont, setFontSize, loadFont, applyFonts, loadedFonts } = useFontStore();

  useEffect(() => {
    setMounted(true);
    // Load notification settings after mount
    if (typeof window !== 'undefined') {
      const savedNotifications = localStorage.getItem('notifications') === 'true';
      setNotifications(savedNotifications);
      
      // Check notification permission
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
      }
    }
    // Load fonts
    fetchFonts();
    // Load current fonts on component mount
    Object.values(fontSettings).forEach(font => loadFont(font));
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

  const fetchFonts = async () => {
    try {
      setLoading(true);
      console.log('Fetching fonts from API...');
      const response = await fetch('/api/fonts');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Fetched fonts:', data.fonts?.length || 0, 'fonts');
      setFonts(data.fonts || []);
    } catch (error) {
      console.error('Error fetching fonts:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRecommendedFonts = useCallback((category: FontCategory) => {
    // Filter fonts based on category to show appropriate options
    if (category === 'code') {
      // Only show monospace fonts for code
      return fonts.filter(font => font.category === 'monospace');
    } else {
      // Show non-monospace fonts for headings and body
      return fonts.filter(font => font.category !== 'monospace');
    }
  }, [fonts]);

  const filteredFonts = useMemo(() => {
    const recommended = getRecommendedFonts(activeCategory);
    if (!searchTerm) return recommended.slice(0, 50); // Limit initial display
    
    return recommended.filter(font =>
      font.family.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [getRecommendedFonts, activeCategory, searchTerm]);

  const handleFontSelect = (fontFamily: string) => {
    console.log('Selecting font:', fontFamily, 'for category:', activeCategory);
    setFont(activeCategory, fontFamily);
  };

  const handleApplyFonts = async () => {
    setApplying(true);
    try {
      // Ensure all fonts are loaded before applying
      await Promise.all(
        Object.values(fontSettings).map(font => {
          if (!loadedFonts.has(font)) {
            loadFont(font);
            // Wait a bit for font to load
            return new Promise(resolve => setTimeout(resolve, 500));
          }
          return Promise.resolve();
        })
      );
      
      applyFonts();
      
      // Apply fonts to CSS variables for immediate effect
      const root = document.documentElement;
      root.style.setProperty('--font-headings', `"${fontSettings.headings}", sans-serif`);
      root.style.setProperty('--font-body', `"${fontSettings.body}", sans-serif`);
      root.style.setProperty('--font-code', `"${fontSettings.code}", monospace`);
      
      // Show success feedback
      console.log('Fonts applied successfully');
      
      // Visual feedback - briefly highlight the preview
      const preview = document.querySelector('.font-preview-container');
      if (preview) {
        preview.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
        setTimeout(() => {
          preview.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
        }, 1000);
      }
    } catch (error) {
      console.error('Error applying fonts:', error);
    } finally {
      setApplying(false);
    }
  };

  const FontPreviewCard = ({ font, isSelected }: { font: Font; isSelected: boolean }) => {
    const [fontLoaded, setFontLoaded] = useState(loadedFonts.has(font.family));

    useEffect(() => {
      if (!fontLoaded && !loadedFonts.has(font.family)) {
        loadFont(font.family);
        // Check if font loaded after a delay
        const timer = setTimeout(() => {
          setFontLoaded(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }, [font.family, fontLoaded]);

    // Always use the specific font for this card's preview, not global CSS variables
    const fontStyle = {
      fontFamily: fontLoaded ? `"${font.family}", ${font.category === 'monospace' ? 'monospace' : font.category === 'serif' ? 'serif' : 'sans-serif'}` : 'inherit'
    };

    return (
      <div 
        className={`border rounded-lg p-3 cursor-pointer transition-all hover:border-primary hover:shadow-sm ${
          isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : ''
        }`}
        onClick={() => handleFontSelect(font.family)}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{font.family}</span>
          {isSelected && (
            <Check className="h-4 w-4 text-primary" />
          )}
        </div>
        {activeCategory === "headings" && (
          <h3 className="font-preview text-lg font-semibold" style={fontStyle}>
            {PREVIEW_TEXT.heading}
          </h3>
        )}
        {activeCategory === "body" && (
          <p className="font-preview text-sm leading-relaxed" style={fontStyle}>
            {PREVIEW_TEXT.body.substring(0, 80)}...
          </p>
        )}
        {activeCategory === "code" && (
          <pre className="font-preview text-xs bg-muted/50 p-2 rounded overflow-x-auto" style={fontStyle}>
{`function() {
  return true;
}`}
          </pre>
        )}
      </div>
    );
  };

  const CategoryButton = ({ 
    category, 
    label, 
    icon: Icon 
  }: { 
    category: FontCategory; 
    label: string; 
    icon: React.ComponentType<{ className?: string }> 
  }) => (
    <Button
      variant={activeCategory === category ? "default" : "outline"}
      onClick={() => setActiveCategory(category)}
      className="flex items-center gap-2"
      size="sm"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">General</h2>
        <p className="text-muted-foreground">
          Manage your application preferences, theme, and typography.
        </p>
      </div>

      {/* Theme and Application Settings Combined */}
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium mb-2">Appearance & Behavior</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Configure how the application looks and behaves.
          </p>
        </div>
        
        <div className="max-w-2xl space-y-6">
          {/* Theme Selection - Horizontal */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="font-medium">Theme</div>
              <div className="text-sm text-muted-foreground">
                Choose your preferred color scheme
              </div>
            </div>
            <div className="flex items-center gap-2">
              {themeOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = mounted && theme === option.value;
                
                return (
                  <Button
                    key={option.value}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className="h-9 px-3 flex items-center gap-2"
                    onClick={() => setTheme(option.value)}
                    disabled={!mounted}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-xs">{option.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          <Separator className="my-4" />
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
              <div className="font-medium flex items-center gap-2">
                Notifications
                {notificationPermission === 'denied' && (
                  <Bell className="h-3 w-3 text-destructive" />
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {notificationPermission === 'denied' 
                  ? 'Notifications blocked in browser settings'
                  : 'Get notified when tasks complete'}
              </div>
            </div>
            <Switch
              checked={notifications}
              onCheckedChange={async (checked) => {
                if (checked && notificationPermission !== 'granted') {
                  const notificationService = NotificationService.getInstance();
                  const granted = await notificationService.requestPermission();
                  if (granted) {
                    setNotifications(true);
                    setNotificationPermission('granted');
                  }
                } else {
                  setNotifications(checked);
                }
              }}
              disabled={!mounted}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Typography Settings */}
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium mb-2">Typography</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Customize fonts for different parts of the application.
          </p>
        </div>

        {/* Live Preview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-base font-medium mb-1">Live Preview</h4>
              <p className="text-sm text-muted-foreground">
                See how your selected fonts will look in the application.
              </p>
            </div>
            <Button 
              onClick={handleApplyFonts}
              disabled={applying}
              className="flex items-center gap-2"
              size="sm"
            >
              {applying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {applying ? 'Applying...' : 'Apply'}
            </Button>
          </div>
          
          <div className="font-preview-container border rounded-lg p-4 space-y-3 bg-muted/30 transition-all duration-300">
            <div>
              <h1 
                className={`${FONT_SIZE_MAP.headings[fontSizes.headings].h1} font-bold mb-1`} 
                style={{ fontFamily: `"${fontSettings.headings}", sans-serif` }}
              >
                Welcome to codex-clone
              </h1>
              <h2 
                className={`${FONT_SIZE_MAP.headings[fontSizes.headings].h2} font-semibold`} 
                style={{ fontFamily: `"${fontSettings.headings}", sans-serif` }}
              >
                {PREVIEW_TEXT.heading}
              </h2>
            </div>
            
            <div 
              className={`${FONT_SIZE_MAP.body[fontSizes.body]} leading-relaxed`} 
              style={{ fontFamily: `"${fontSettings.body}", sans-serif` }}
            >
              <p>{PREVIEW_TEXT.body}</p>
            </div>
            
            <div>
              <h3 
                className={`${FONT_SIZE_MAP.headings[fontSizes.headings].h2} font-medium mb-2`} 
                style={{ fontFamily: `"${fontSettings.headings}", sans-serif` }}
              >
                Code Example
              </h3>
              <pre 
                className={`bg-background border rounded p-3 ${FONT_SIZE_MAP.code[fontSizes.code]} overflow-x-auto`} 
                style={{ fontFamily: `"${fontSettings.code}", monospace` }}
              >
{PREVIEW_TEXT.code}
              </pre>
            </div>
          </div>
        </div>

        {/* Font Selection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-medium">Choose Fonts</h4>
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading fonts...
              </div>
            )}
          </div>
          
          {/* Category Selection */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <CategoryButton category="headings" label="Headings" icon={Hash} />
              <CategoryButton category="body" label="Body" icon={Type} />
              <CategoryButton category="code" label="Code" icon={Code} />
            </div>
            
            {/* Font Size Controls */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Size:</span>
              <div className="flex gap-1">
                {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
                  <Button
                    key={size}
                    variant={fontSizes[activeCategory] === size ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFontSize(activeCategory, size)}
                    className="px-2 h-8"
                  >
                    {size.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${activeCategory} fonts...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Font List */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="border rounded-lg p-3 animate-pulse">
                  <div className="h-4 bg-muted rounded mb-2"></div>
                  <div className="h-6 bg-muted rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto border rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
                {filteredFonts.map((font) => (
                  <FontPreviewCard
                    key={font.family}
                    font={font}
                    isSelected={fontSettings[activeCategory] === font.family}
                  />
                ))}
              </div>
              {filteredFonts.length === 0 && !loading && (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? (
                    <>No fonts found matching &quot;{searchTerm}&quot;</>
                  ) : (
                    <>No fonts available for this category</>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}