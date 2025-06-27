import { NextResponse } from "next/server";

export async function GET() {
  console.log("🧪 Starting Docker connectivity test...");
  
  try {
    const Docker = await import("dockerode");
    const docker = new Docker.default({ socketPath: "/var/run/docker.sock" });
    
    console.log("🐳 Docker client created");
    
    // Test connection
    const info = await docker.info();
    console.log("✅ Docker info retrieved:", {
      serverVersion: info.ServerVersion,
      containers: info.Containers,
      images: info.Images
    });
    
    // List containers
    const containers = await docker.listContainers({ all: true });
    console.log("📋 Containers found:", containers.length);
    
    // Try to create a simple test container with ubuntu
    console.log("🏗️ Creating test container with superagentai/vibekit-claude:1.0...");
    try {
      const container = await docker.createContainer({
        Image: "superagentai/vibekit-claude:1.0",
        Cmd: ["echo", "Docker test successful!"],
        name: `vibekit-test-${Date.now()}`,
        HostConfig: {
          AutoRemove: true,
        },
      });
      console.log("✅ Test container created:", container.id);
      
      // Start and wait for it to complete
      console.log("▶️ Starting test container...");
      await container.start();
      console.log("✅ Test container started and should auto-remove");
      
      return NextResponse.json({
        success: true,
        dockerInfo: {
          serverVersion: info.ServerVersion,
          containers: info.Containers,
          images: info.Images,
        },
        testContainer: {
          id: container.id,
          status: "created and started successfully"
        }
      });
    } catch (containerError) {
      console.log("⚠️ Container creation failed, but Docker daemon is accessible:", containerError);
      
      return NextResponse.json({
        success: true,
        dockerInfo: {
          serverVersion: info.ServerVersion,
          containers: info.Containers,
          images: info.Images,
        },
        note: "Docker daemon accessible but container creation failed (likely missing image)",
        containerError: containerError instanceof Error ? containerError.message : String(containerError)
      });
    }
    
  } catch (error) {
    console.error("❌ Docker test failed:", error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: "Check server logs for more details"
    }, { status: 500 });
  }
}