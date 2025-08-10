import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const MCP_CONFIG_PATH = join(homedir(), '.vibekit', 'mcp-servers.json');

export async function DELETE(
  req: NextRequest,
  { params }: { params: { serverId: string } }
) {
  try {
    const { serverId } = params;

    if (!serverId) {
      return Response.json(
        { error: 'Server ID is required' },
        { status: 400 }
      );
    }

    // Load existing config
    let mcpConfig: { mcpServers: { [key: string]: any } } = { mcpServers: {} };
    
    try {
      const data = await fs.readFile(MCP_CONFIG_PATH, 'utf-8');
      mcpConfig = JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return Response.json(
          { error: 'No MCP config file found' },
          { status: 404 }
        );
      }
      console.error('Error reading MCP config:', error);
      return Response.json(
        { error: 'Failed to read existing config' },
        { status: 500 }
      );
    }

    // Check if server exists
    if (!mcpConfig.mcpServers || !mcpConfig.mcpServers[serverId]) {
      return Response.json(
        { error: `Server ${serverId} not found` },
        { status: 404 }
      );
    }

    // Remove the server
    delete mcpConfig.mcpServers[serverId];

    // Save the updated config
    await fs.writeFile(
      MCP_CONFIG_PATH,
      JSON.stringify(mcpConfig, null, 2),
      'utf-8'
    );

    return Response.json({
      success: true,
      message: `Server ${serverId} removed successfully`
    });
  } catch (error) {
    console.error('Error removing MCP server:', error);
    return Response.json(
      { error: 'Failed to remove MCP server' },
      { status: 500 }
    );
  }
}