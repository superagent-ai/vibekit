import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const MCP_CONFIG_PATH = join(homedir(), '.vibekit', 'mcp-servers.json');

export async function GET(req: NextRequest) {
  try {
    // Ensure directory exists
    const configDir = join(homedir(), '.vibekit');
    await fs.mkdir(configDir, { recursive: true });

    let config = { mcpServers: {} };
    
    try {
      const data = await fs.readFile(MCP_CONFIG_PATH, 'utf-8');
      config = JSON.parse(data);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('Error reading MCP config:', error);
      }
      // File doesn't exist, use empty config
    }

    return Response.json(config);
  } catch (error) {
    console.error('Error loading MCP servers:', error);
    return Response.json(
      { error: 'Failed to load MCP servers' }, 
      { status: 500 }
    );
  }
}