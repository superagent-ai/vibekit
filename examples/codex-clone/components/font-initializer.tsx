"use client";
import { useEffect } from "react";
import { useFontStore } from "@/stores/fonts";

export default function FontInitializer() {
  const { fontSettings, fontSizes, loadFont, applyFonts } = useFontStore();

  useEffect(() => {
    // Load saved fonts on app initialization
    Object.values(fontSettings).forEach(font => {
      loadFont(font);
    });
    
    // Apply the fonts and sizes to CSS variables
    applyFonts();
  }, []); // Only run on mount

  // Re-apply when font sizes change
  useEffect(() => {
    const root = document.documentElement;
    const sizeMap = {
      sm: { headings: { h1: '1.25rem', h2: '1rem' }, body: '0.75rem', code: '0.75rem' },
      md: { headings: { h1: '1.5rem', h2: '1.125rem' }, body: '0.875rem', code: '0.875rem' },
      lg: { headings: { h1: '1.875rem', h2: '1.25rem' }, body: '1rem', code: '1rem' },
      xl: { headings: { h1: '2.25rem', h2: '1.5rem' }, body: '1.125rem', code: '1.125rem' }
    };
    
    root.style.setProperty('--font-size-h1', sizeMap[fontSizes.headings].headings.h1);
    root.style.setProperty('--font-size-h2', sizeMap[fontSizes.headings].headings.h2);
    root.style.setProperty('--font-size-body', sizeMap[fontSizes.body].body);
    root.style.setProperty('--font-size-code', sizeMap[fontSizes.code].code);
  }, [fontSizes]);

  return null; // This component doesn't render anything
}