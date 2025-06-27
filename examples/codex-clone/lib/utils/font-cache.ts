import fs from 'fs';
import path from 'path';

interface CachedFonts {
  fonts: any[];
  timestamp: number;
}

const CACHE_DIR = path.join(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'google-fonts.json');
const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

export async function getCachedFonts(): Promise<any[] | null> {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return null;
    }

    const cacheData = fs.readFileSync(CACHE_FILE, 'utf-8');
    const cached: CachedFonts = JSON.parse(cacheData);

    // Check if cache is still valid
    if (Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('Using cached Google Fonts data');
      return cached.fonts;
    }

    console.log('Font cache expired');
    return null;
  } catch (error) {
    console.error('Error reading font cache:', error);
    return null;
  }
}

export async function setCachedFonts(fonts: any[]): Promise<void> {
  try {
    // Ensure cache directory exists
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    const cacheData: CachedFonts = {
      fonts,
      timestamp: Date.now()
    };

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
    console.log(`Cached ${fonts.length} fonts`);
  } catch (error) {
    console.error('Error writing font cache:', error);
  }
}

export async function clearFontCache(): Promise<void> {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
      console.log('Font cache cleared');
    }
  } catch (error) {
    console.error('Error clearing font cache:', error);
  }
}