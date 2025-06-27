import { NextResponse } from 'next/server';
import { getCachedFonts, setCachedFonts } from '@/lib/utils/font-cache';

interface GoogleFont {
  family: string;
  category: string;
  variants: string[];
  subsets: string[];
}

interface GoogleFontsResponse {
  items: GoogleFont[];
}

export async function GET() {
  try {
    // Check cache first
    const cachedFonts = await getCachedFonts();
    if (cachedFonts) {
      return NextResponse.json({ fonts: cachedFonts });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
    }

    console.log('Fetching fresh fonts from Google Fonts API...');
    const response = await fetch(
      `https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`,
      { next: { revalidate: 86400 } } // Cache for 24 hours
    );

    if (!response.ok) {
      throw new Error('Failed to fetch fonts');
    }

    const data: GoogleFontsResponse = await response.json();
    
    // Common icon font names to filter out
    const iconFontNames = [
      'Material Icons', 
      'Material Icons Outlined',
      'Material Icons Round',
      'Material Icons Sharp',
      'Material Icons Two Tone',
      'Material Symbols Outlined',
      'Material Symbols Rounded',
      'Material Symbols Sharp',
      'Font Awesome',
      'Font Awesome 5 Brands',
      'Font Awesome 5 Free',
      'Font Awesome 5 Regular',
      'Font Awesome 5 Solid',
      'Font Awesome 6 Brands',
      'Font Awesome 6 Free',
      'Font Awesome 6 Regular', 
      'Font Awesome 6 Solid',
      'FontAwesome',
      'Ionicons',
      'Glyphicons',
      'Octicons',
      'Typicons',
      'Entypo',
      'Foundation Icons',
      'Themify Icons',
      'Streamline Icons',
      'Stroke Icons',
      'Devicons',
      'Linearicons',
      'IcoMoon',
      'Icomoon'
    ];

    // Filter out icon fonts and categorize fonts
    const fonts = data.items
      .filter((font: GoogleFont) => {
        // Filter out fonts with "Icons" or "Symbols" in the name
        const lowerName = font.family.toLowerCase();
        return !iconFontNames.some(iconFont => 
          font.family === iconFont || 
          lowerName.includes('icons') || 
          lowerName.includes('symbols') ||
          lowerName.includes('emoji') ||
          lowerName.includes('dingbats') ||
          lowerName.includes('wingdings')
        );
      })
      .map((font: {
        family: string;
        category: string;
        variants: string[];
        subsets: string[];
      }) => ({
        family: font.family,
        category: font.category,
        variants: font.variants,
        subsets: font.subsets,
        // Determine if font is good for different use cases
        isRegular: font.category === 'sans-serif' || font.category === 'serif',
        isMono: font.category === 'monospace',
        isDisplay: font.category === 'display',
      }));

    // Cache the fonts
    await setCachedFonts(fonts);

    return NextResponse.json({ fonts });
  } catch (error) {
    console.error('Error fetching fonts:', error);
    return NextResponse.json({ error: 'Failed to fetch fonts' }, { status: 500 });
  }
}