import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const settingsPath = path.join(os.homedir(), '.vibekit', 'settings.json');

// Match the exact structure from cli.js readSettings()
const defaultSettings = {
  sandbox: { enabled: false, type: 'docker' },
  proxy: { enabled: true, redactionEnabled: true },
  analytics: { enabled: true },
  aliases: { enabled: false }
};

export async function GET() {
  try {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    
    try {
      await fs.access(settingsPath);
      const content = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(content);
      return NextResponse.json({ ...defaultSettings, ...settings });
    } catch {
      return NextResponse.json(defaultSettings);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    return NextResponse.json(defaultSettings);
  }
}

export async function POST(request: NextRequest) {
  try {
    const settings = await request.json();
    
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}