import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FontSettings {
  headings: string;
  body: string;
  code: string;
}

type FontSize = 'sm' | 'md' | 'lg' | 'xl';

interface FontSizes {
  headings: FontSize;
  body: FontSize;
  code: FontSize;
}

interface FontStore {
  fontSettings: FontSettings;
  fontSizes: FontSizes;
  previewFontSettings: FontSettings;
  previewFontSizes: FontSizes;
  loadedFonts: Set<string>;
  setFont: (category: keyof FontSettings, fontFamily: string) => void;
  setFontSize: (category: keyof FontSizes, size: FontSize) => void;
  setPreviewFont: (category: keyof FontSettings, fontFamily: string) => void;
  setPreviewFontSize: (category: keyof FontSizes, size: FontSize) => void;
  loadFont: (fontFamily: string) => void;
  applyFonts: () => void;
  syncPreviewWithSaved: () => void;
}

const DEFAULT_FONTS: FontSettings = {
  headings: "Inter",
  body: "Inter",
  code: "Fira Code"
};

const DEFAULT_SIZES: FontSizes = {
  headings: "md",
  body: "md",
  code: "md"
};

export const useFontStore = create<FontStore>()(
  persist(
    (set, get) => ({
      fontSettings: DEFAULT_FONTS,
      fontSizes: DEFAULT_SIZES,
      previewFontSettings: DEFAULT_FONTS,
      previewFontSizes: DEFAULT_SIZES,
      loadedFonts: new Set(),

      setFont: (category, fontFamily) => {
        set((state) => ({
          fontSettings: {
            ...state.fontSettings,
            [category]: fontFamily
          }
        }));
      },

      setFontSize: (category, size) => {
        set((state) => ({
          fontSizes: {
            ...state.fontSizes,
            [category]: size
          }
        }));
      },

      setPreviewFont: (category, fontFamily) => {
        set((state) => ({
          previewFontSettings: {
            ...state.previewFontSettings,
            [category]: fontFamily
          }
        }));
        get().loadFont(fontFamily);
      },

      setPreviewFontSize: (category, size) => {
        set((state) => ({
          previewFontSizes: {
            ...state.previewFontSizes,
            [category]: size
          }
        }));
      },

      loadFont: (fontFamily) => {
        if (typeof window === 'undefined') return;
        
        const { loadedFonts } = get();
        if (loadedFonts.has(fontFamily)) return;

        // Check if font link already exists to avoid duplicates
        const encodedFontFamily = encodeURIComponent(fontFamily);
        const existingLink = document.querySelector(`link[href*="${encodedFontFamily}"]`);
        if (existingLink) {
          set((state) => ({
            loadedFonts: new Set([...state.loadedFonts, fontFamily])
          }));
          return;
        }

        // Create and inject Google Fonts link with preload for better performance
        const link = document.createElement('link');
        link.href = `https://fonts.googleapis.com/css2?family=${encodedFontFamily}:wght@300;400;500;600;700&display=swap`;
        link.rel = 'stylesheet';
        link.crossOrigin = 'anonymous';
        
        // Add preconnect for faster loading
        if (!document.querySelector('link[href="https://fonts.gstatic.com"]')) {
          const preconnect = document.createElement('link');
          preconnect.href = 'https://fonts.gstatic.com';
          preconnect.rel = 'preconnect';
          preconnect.crossOrigin = 'anonymous';
          document.head.appendChild(preconnect);
        }
        
        document.head.appendChild(link);
        
        set((state) => ({
          loadedFonts: new Set([...state.loadedFonts, fontFamily])
        }));
      },

      applyFonts: () => {
        if (typeof window === 'undefined') return;
        
        const { previewFontSettings, previewFontSizes } = get();
        
        // Copy preview settings to actual settings
        set({
          fontSettings: previewFontSettings,
          fontSizes: previewFontSizes
        });
        
        // Apply fonts to CSS variables for global use
        const root = document.documentElement;
        root.style.setProperty('--font-headings', `"${previewFontSettings.headings}", sans-serif`);
        root.style.setProperty('--font-body', `"${previewFontSettings.body}", sans-serif`);
        root.style.setProperty('--font-code', `"${previewFontSettings.code}", monospace`);
        
        // Apply font sizes to CSS variables with actual rem values
        const sizeMap = {
          sm: { headings: { h1: '1.25rem', h2: '1rem' }, body: '0.75rem', code: '0.75rem' },
          md: { headings: { h1: '1.5rem', h2: '1.125rem' }, body: '0.875rem', code: '0.875rem' },
          lg: { headings: { h1: '1.875rem', h2: '1.25rem' }, body: '1rem', code: '1rem' },
          xl: { headings: { h1: '2.25rem', h2: '1.5rem' }, body: '1.125rem', code: '1.125rem' }
        };
        
        root.style.setProperty('--font-size-h1', sizeMap[previewFontSizes.headings].headings.h1);
        root.style.setProperty('--font-size-h2', sizeMap[previewFontSizes.headings].headings.h2);
        root.style.setProperty('--font-size-body', sizeMap[previewFontSizes.body].body);
        root.style.setProperty('--font-size-code', sizeMap[previewFontSizes.code].code);
        
        // Persist the settings
        console.log('Font settings applied globally:', previewFontSettings, previewFontSizes);
      },

      syncPreviewWithSaved: () => {
        const { fontSettings, fontSizes } = get();
        set({
          previewFontSettings: fontSettings,
          previewFontSizes: fontSizes
        });
      }
    }),
    {
      name: 'font-settings',
      partialize: (state) => ({ 
        fontSettings: state.fontSettings,
        fontSizes: state.fontSizes 
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Initialize preview settings from saved settings
          state.previewFontSettings = { ...state.fontSettings };
          state.previewFontSizes = { ...state.fontSizes };
          // Also ensure loadedFonts is a Set
          state.loadedFonts = new Set();
        }
      },
      // Add custom storage to handle serialization properly
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          return JSON.parse(str);
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        }
      }
    }
  )
);