import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // Check if Docker is running
    const checks = {
      dockerInstalled: false,
      dockerRunning: false,
      dockerVersion: null as string | null,
      error: null as string | null,
    };

    try {
      // Check if Docker is installed
      const { stdout: versionOutput } = await execAsync('docker --version');
      checks.dockerInstalled = true;
      checks.dockerVersion = versionOutput.trim();
    } catch (error) {
      checks.error = 'Docker is not installed. Please install Docker Desktop from https://www.docker.com/products/docker-desktop';
      return NextResponse.json(checks);
    }

    try {
      // Check if Docker daemon is running by trying to list containers
      await execAsync('docker ps -q', { timeout: 5000 });
      checks.dockerRunning = true;
    } catch (error: any) {
      if (error.message?.includes('Cannot connect to the Docker daemon')) {
        checks.error = 'Docker is installed but not running. Please start Docker Desktop.';
      } else if (error.message?.includes('permission denied')) {
        checks.error = 'Docker requires elevated permissions. Please ensure your user has access to Docker.';
      } else {
        checks.error = `Docker check failed: ${error.message || 'Unknown error'}`;
      }
    }

    return NextResponse.json(checks);
  } catch (error: any) {
    console.error('Failed to check Docker status:', error);
    return NextResponse.json(
      { 
        dockerInstalled: false,
        dockerRunning: false,
        dockerVersion: null,
        error: `Failed to check Docker status: ${error.message || 'Unknown error'}` 
      },
      { status: 500 }
    );
  }
}