import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const MCP_CONFIG_PATH = join(homedir(), '.vibekit', 'mcp-servers.json');

export async function POST(req: NextRequest) {
  try {
    const { serverId, config } = await req.json();

    if (!serverId || !config) {
      return Response.json(
        { error: 'Server ID and config are required' },
        { status: 400 }
      );
    }

    // Ensure directory exists
    const configDir = join(homedir(), '.vibekit');
    await fs.mkdir(configDir, { recursive: true });

    // Load existing config
    let mcpConfig = { mcpServers: {} };
    
    try {
      const data = await fs.readFile(MCP_CONFIG_PATH, 'utf-8');
      mcpConfig = JSON.parse(data);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('Error reading MCP config:', error);
        return Response.json(
          { error: 'Failed to read existing config' },
          { status: 500 }
        );
      }
      // File doesn't exist, use empty config
    }

    // Ensure mcpServers object exists
    if (!mcpConfig.mcpServers) {
      mcpConfig.mcpServers = {};
    }

    // Add the new server
    mcpConfig.mcpServers[serverId] = {
      command: config.command,
      args: config.args,
      enabled: config.enabled || true
    };

    // Save the updated config
    await fs.writeFile(
      MCP_CONFIG_PATH, 
      JSON.stringify(mcpConfig, null, 2),
      'utf-8'
    );

    return Response.json({ 
      success: true, 
      message: `Server ${serverId} installed successfully` 
    });
  } catch (error) {
    console.error('Error installing MCP server:', error);
    return Response.json(
      { error: 'Failed to install MCP server' },
      { status: 500 }
    );
  }
}