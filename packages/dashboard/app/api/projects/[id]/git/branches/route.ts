import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export async function GET(request: NextRequest) {
  try {
    // Get project root from query parameters
    const searchParams = request.nextUrl.searchParams;
    const projectRoot = searchParams.get('projectRoot');
    
    console.log('Git branches API called with projectRoot:', projectRoot);
    
    if (!projectRoot) {
      console.error('No project root provided');
      return NextResponse.json(
        { 
          error: 'Project root is required',
          branches: [],
          currentBranch: ''
        },
        { status: 400 }
      );
    }
    
    // Verify project root exists
    try {
      await fs.access(projectRoot);
      // Also check if it's a git repository
      await fs.access(path.join(projectRoot, '.git'));
    } catch (err) {
      console.error('Project root does not exist or is not a git repo:', projectRoot, err);
      return NextResponse.json(
        { 
          error: 'Project root does not exist or is not a git repository',
          branches: [],
          currentBranch: ''
        },
        { status: 404 }
      );
    }
    
    // Get all branches (local and remote)
    console.log(`Executing: git branch -a in ${projectRoot}`);
    const { stdout: branchesOutput, stderr: branchesError } = await execAsync('git branch -a', {
      cwd: projectRoot
    });
    
    if (branchesError) {
      console.error('Git branch stderr:', branchesError);
    }
    
    console.log('Git branch raw output:', branchesOutput);
    
    // Parse branches - be more careful with parsing
    const lines = branchesOutput.split('\n');
    console.log(`Git branch output has ${lines.length} lines`);
    
    const allBranches = new Set<string>();
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.includes('HEAD')) continue;
      
      let branchName = trimmed;
      
      // Remove * for current branch
      if (branchName.startsWith('* ')) {
        branchName = branchName.substring(2);
      }
      
      // Remove remotes/origin/ prefix but keep the branch name
      if (branchName.startsWith('remotes/origin/')) {
        branchName = branchName.substring('remotes/origin/'.length);
      } else if (branchName.startsWith('remotes/')) {
        // Skip other remotes
        continue;
      }
      
      // Clean up any remaining whitespace
      branchName = branchName.trim();
      
      if (branchName) {
        allBranches.add(branchName);
      }
    }
    
    const branches = Array.from(allBranches).sort();
    console.log('Parsed branches:', branches);
    
    // Get current branch
    let currentBranch = '';
    try {
      const { stdout: currentBranchOutput } = await execAsync('git branch --show-current', {
        cwd: projectRoot
      });
      currentBranch = currentBranchOutput.trim();
      
      // If empty (detached HEAD or other issue), try alternative
      if (!currentBranch) {
        const { stdout: altBranchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
          cwd: projectRoot
        });
        currentBranch = altBranchOutput.trim();
      }
    } catch (error) {
      console.error('Could not determine current branch:', error);
      currentBranch = branches[0] || '';
    }
    
    console.log(`Found ${branches.length} branches, current: ${currentBranch}`);
    
    return NextResponse.json({
      branches,
      currentBranch,
    });
  } catch (error: any) {
    console.error('Failed to fetch git branches:', error);
    console.error('Error details:', error.message, error.code);
    return NextResponse.json(
      { 
        error: `Failed to fetch git branches: ${error.message}`,
        branches: [],
        currentBranch: ''
      },
      { status: 500 }
    );
  }
}