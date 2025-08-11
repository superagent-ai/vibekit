import { NextRequest, NextResponse } from 'next/server';
import { getManager } from '@/app/api/mcp/utils';

export async function GET() {
  try {
    const mgr = await getManager();
    const servers = mgr.getAllServers();
    
    return NextResponse.json({ 
      servers: servers.map(server => ({
        ...server,
        status: mgr.isConnected(server.id) ? 'active' : server.status,
      }))
    });
  } catch (error) {
    console.error('Failed to get servers:', error);
    return NextResponse.json(
      { error: 'Failed to get servers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const mgr = await getManager();
    
    const server = await mgr.addServer({
      name: data.name,
      description: data.description,
      transport: data.transport,
      config: data.config,
    });
    
    // Auto-connect the server after adding it
    let toolCount = 0;
    let resourceCount = 0;
    let promptCount = 0;
    
    try {
      await mgr.connect(server.id);
      console.log(`[API] Auto-connected server ${server.name} (${server.id})`);
      
      // Wait a moment for the connection to stabilize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // If connected, actively fetch the tools to ensure counts are accurate
      if (mgr.isConnected(server.id)) {
        try {
          const [tools, resources, prompts] = await Promise.all([
            mgr.getTools(server.id).catch(() => []),
            mgr.getResources(server.id).catch(() => []),
            mgr.getPrompts(server.id).catch(() => [])
          ]);
          
          toolCount = tools.length;
          resourceCount = resources.length;
          promptCount = prompts.length;
          
          console.log(`[API] Server ${server.name} capabilities:`, {
            tools: toolCount,
            resources: resourceCount,
            prompts: promptCount
          });
          
          // Update the server counts directly in the config store
          const configStore = (mgr as any).configStore;
          if (configStore) {
            await configStore.updateServer(server.id, {
              toolCount,
              resourceCount,
              promptCount
            });
          }
        } catch (error) {
          console.log(`[API] Could not fetch capabilities for ${server.name}:`, error);
        }
      }
    } catch (connectError) {
      console.error(`[API] Failed to auto-connect server ${server.name}:`, connectError);
      // Don't fail the whole request if connection fails - server is still added
    }
    
    // Get the fully updated server
    const updatedServer = mgr.getServer(server.id);
    return NextResponse.json({ 
      server: {
        ...updatedServer,
        status: mgr.isConnected(server.id) ? 'active' : updatedServer?.status,
        toolCount: toolCount || updatedServer?.toolCount || 0,
        resourceCount: resourceCount || updatedServer?.resourceCount || 0,
        promptCount: promptCount || updatedServer?.promptCount || 0,
      }
    });
  } catch (error) {
    console.error('Failed to add server:', error);
    return NextResponse.json(
      { error: 'Failed to add server' },
      { status: 500 }
    );
  }
}