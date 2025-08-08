import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs-extra';
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
    await fs.ensureDir(path.dirname(settingsPath));
    
    if (await fs.pathExists(settingsPath)) {
      const settings = await fs.readJson(settingsPath);
      return NextResponse.json({ ...defaultSettings, ...settings });
    } else {
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
    
    await fs.ensureDir(path.dirname(settingsPath));
    await fs.writeJson(settingsPath, settings, { spaces: 2 });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}