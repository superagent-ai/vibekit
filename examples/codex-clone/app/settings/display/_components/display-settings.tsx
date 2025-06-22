"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Type, Code, Hash, Check, Loader2, RefreshCw, ChevronDown } from "lucide-react";
import { useFontStore } from "@/stores/fonts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
  code: `function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const result = fibonacci(10);
console.log(\`Result: \${result}\`);`
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

export default function DisplaySettings() {
  const [fonts, setFonts] = useState<Font[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<FontCategory>("headings");
  const [applying, setApplying] = useState(false);
  
  const { fontSettings, fontSizes, previewFontSettings, previewFontSizes, setPreviewFont, setPreviewFontSize, loadFont, applyFonts, loadedFonts, syncPreviewWithSaved } = useFontStore();

  useEffect(() => {
    fetchFonts();
    // Sync preview settings with saved settings on mount
    syncPreviewWithSaved();
    // Load current fonts on component mount
    Object.values(fontSettings).forEach(font => loadFont(font));
  }, []);

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
    if (!searchTerm) return recommended.slice(0, 100); // Limit initial display
    
    return recommended.filter(font =>
      font.family.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [getRecommendedFonts, activeCategory, searchTerm]);

  const handleFontSelect = (fontFamily: string) => {
    console.log('Selecting font:', fontFamily, 'for category:', activeCategory);
    setPreviewFont(activeCategory, fontFamily);
  };

  const handleApplyFonts = async () => {
    setApplying(true);
    try {
      // Ensure all fonts are loaded before applying
      const fontsToLoad = Object.values(previewFontSettings).filter(font => !loadedFonts.has(font));
      
      if (fontsToLoad.length > 0) {
        await Promise.all(
          fontsToLoad.map(font => {
            loadFont(font);
            // Wait a bit for font to load
            return new Promise(resolve => setTimeout(resolve, 500));
          })
        );
      }
      
      // Force re-apply fonts to ensure they're set
      applyFonts();
      
      // Show success feedback
      console.log('Fonts applied successfully:', fontSettings);
      
      // Visual feedback - briefly highlight the preview
      const preview = document.querySelector('.font-preview-container');
      if (preview) {
        preview.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
        setTimeout(() => {
          preview.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
        }, 1000);
      }
      
      // Force a small delay to ensure state updates properly
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('Error applying fonts:', error);
    } finally {
      setApplying(false);
    }
  };

  const FontPreviewCard = ({ font, isSelected }: { font: Font; isSelected: boolean }) => {
    const [fontLoaded, setFontLoaded] = useState(false);

    useEffect(() => {
      // Always try to load the font when component mounts or font changes
      loadFont(font.family);
      
      // Use Font Loading API to wait for font to load
      const checkFontLoaded = async () => {
        if (document.fonts) {
          try {
            // Wait for font to be ready
            await document.fonts.ready;
            
            // Check if font is loaded
            const fontLoadPromise = document.fonts.load(`12px "${font.family}"`);
            await fontLoadPromise;
            
            // Double check font is available
            const isLoaded = document.fonts.check(`12px "${font.family}"`);
            setFontLoaded(isLoaded);
          } catch (error) {
            console.warn(`Font loading check failed for ${font.family}:`, error);
            // Assume font is loaded after a delay
            setTimeout(() => setFontLoaded(true), 1000);
          }
        } else {
          // Fallback: just wait a bit and assume it's loaded
          setTimeout(() => setFontLoaded(true), 1000);
        }
      };
      
      checkFontLoaded();
    }, [font.family, loadFont]);

    // Always use the specific font for this card's preview - force it with !important style
    const fontStyle = {
      fontFamily: `"${font.family}", ${font.category === 'monospace' ? 'monospace' : font.category === 'serif' ? 'serif' : 'sans-serif'}`,
      // Force the font to override any inherited styles
      fontWeight: 'normal'
    };

    return (
      <div 
        className={`border rounded-lg p-4 cursor-pointer transition-all hover:border-primary hover:shadow-sm ${
          isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : ''
        }`}
        onClick={() => handleFontSelect(font.family)}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{font.family}</span>
            {isSelected && <Check className="h-4 w-4 text-primary" />}
          </div>
          <div className="flex gap-1">
            {font.category === 'monospace' && (
              <Badge variant="secondary" className="text-xs">Mono</Badge>
            )}
            {font.isDisplay && (
              <Badge variant="outline" className="text-xs">Display</Badge>
            )}
            {!fontLoaded && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
        
        <div className="space-y-2">
          {activeCategory === "headings" && (
            <h3 className="text-lg font-semibold leading-tight font-preview-card" style={fontStyle}>
              {PREVIEW_TEXT.heading}
            </h3>
          )}
          {activeCategory === "body" && (
            <p className="text-sm leading-relaxed font-preview-card" style={fontStyle}>
              {PREVIEW_TEXT.body.substring(0, 120)}...
            </p>
          )}
          {activeCategory === "code" && (
            <pre className="text-xs bg-muted/50 p-3 rounded overflow-x-auto font-preview-card" style={fontStyle}>
{`function hello() {
  return "Hello World";
}`}
            </pre>
          )}
        </div>
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
    >
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">Display</h2>
        <p className="text-muted-foreground">
          Customize fonts and visual appearance. Choose from {fonts.length} Google Fonts.
        </p>
      </div>

      {/* Live Preview Section - Moved to top */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium mb-2">Live Preview</h3>
            <p className="text-sm text-muted-foreground">
              See how your selected fonts will look in the application.
            </p>
          </div>
          <Button 
            onClick={handleApplyFonts}
            disabled={applying}
            className="flex items-center gap-2"
          >
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {applying ? 'Applying...' : 'Apply'}
          </Button>
        </div>
        
        <div className="font-preview-container border rounded-lg p-6 space-y-4 bg-muted/30 transition-all duration-300">
          <div>
            <h1 
              className={`${FONT_SIZE_MAP.headings[previewFontSizes.headings].h1} font-bold mb-2`} 
              style={{ fontFamily: `"${previewFontSettings.headings}", sans-serif` }}
            >
              Welcome to codex-clone
            </h1>
            <h2 
              className={`${FONT_SIZE_MAP.headings[previewFontSizes.headings].h2} font-semibold`} 
              style={{ fontFamily: `"${previewFontSettings.headings}", sans-serif` }}
            >
              {PREVIEW_TEXT.heading}
            </h2>
          </div>
          
          <div 
            className={`${FONT_SIZE_MAP.body[previewFontSizes.body]} leading-relaxed`} 
            style={{ fontFamily: `"${previewFontSettings.body}", sans-serif` }}
          >
            <p>{PREVIEW_TEXT.body.substring(0, 200)}...</p>
          </div>
          
          <div>
            <h3 
              className={`${FONT_SIZE_MAP.headings[previewFontSizes.headings].h2} font-medium mb-2`} 
              style={{ fontFamily: `"${previewFontSettings.headings}", sans-serif` }}
            >
              Code Example
            </h3>
            <pre 
              className={`bg-background border rounded p-3 ${FONT_SIZE_MAP.code[previewFontSizes.code]} overflow-x-auto`} 
              style={{ fontFamily: `"${previewFontSettings.code}", monospace` }}
            >
{`function hello() {
  return "Hello World";
}`}
            </pre>
          </div>
        </div>
      </div>

      {/* Font Selection */}
      <Collapsible defaultOpen className="space-y-4">
        <CollapsibleTrigger className="flex items-center justify-between w-full group">
          <div className="flex items-center gap-2">
            <ChevronDown className="h-5 w-5 transition-transform group-data-[state=closed]:-rotate-90" />
            <h3 className="text-lg font-medium">Typography Settings</h3>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading fonts...
            </div>
          )}
        </CollapsibleTrigger>
        
        <CollapsibleContent className="space-y-4">
        
        {/* Category Selection */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <CategoryButton category="headings" label="Headings" icon={Hash} />
            <CategoryButton category="body" label="Body Text" icon={Type} />
            <CategoryButton category="code" label="Code" icon={Code} />
          </div>
          
          {/* Font Size Controls */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Size:</span>
            <div className="flex gap-1">
              {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
                <Button
                  key={size}
                  variant={previewFontSizes[activeCategory] === size ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPreviewFontSize(activeCategory, size)}
                  className="px-3"
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="border rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-muted rounded mb-3"></div>
                <div className="h-8 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto border rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {filteredFonts.map((font) => (
                <FontPreviewCard
                  key={font.family}
                  font={font}
                  isSelected={previewFontSettings[activeCategory] === font.family}
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
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}