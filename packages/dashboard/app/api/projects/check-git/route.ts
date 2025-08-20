import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { projectRoot } = await request.json();
    
    if (!projectRoot) {
      return NextResponse.json(
        { success: false, error: 'Project root is required' },
        { status: 400 }
      );
    }
    
    // Check if .git folder exists
    const gitPath = path.join(projectRoot, '.git');
    
    try {
      const stats = await fs.stat(gitPath);
      const hasGitRepo = stats.isDirectory();
      
      if (!hasGitRepo) {
        return NextResponse.json({
          success: true,
          hasGitRepo: false,
          gitInfo: null
        });
      }
      
      // If we have a git repo, gather information
      const gitInfo: any = {
        hasGitRepo: true
      };
      
      // Get current branch
      try {
        const { stdout: currentBranchOutput } = await execAsync('git branch --show-current', {
          cwd: projectRoot
        });
        gitInfo.currentBranch = currentBranchOutput.trim();
        
        // If empty (detached HEAD), try alternative
        if (!gitInfo.currentBranch) {
          const { stdout: altBranchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
            cwd: projectRoot
          });
          gitInfo.currentBranch = altBranchOutput.trim();
        }
      } catch (error) {
        console.warn('Could not determine current branch:', error);
        gitInfo.currentBranch = null;
      }
      
      // Get remote URL (origin)
      try {
        const { stdout: remoteOutput } = await execAsync('git remote get-url origin', {
          cwd: projectRoot
        });
        gitInfo.remoteUrl = remoteOutput.trim();
      } catch (error) {
        // No remote or other issue
        gitInfo.remoteUrl = null;
      }
      
      // Get last commit info
      try {
        const { stdout: lastCommitOutput } = await execAsync('git log -1 --pretty=format:"%H|%s|%an|%ad" --date=iso', {
          cwd: projectRoot
        });
        
        if (lastCommitOutput.trim()) {
          const [hash, message, author, date] = lastCommitOutput.split('|');
          gitInfo.lastCommit = {
            hash: hash,
            message: message,
            author: author,
            date: date
          };
        }
      } catch (error) {
        console.warn('Could not get last commit info:', error);
        gitInfo.lastCommit = null;
      }
      
      // Check if working directory is clean
      try {
        const { stdout: statusOutput } = await execAsync('git status --porcelain', {
          cwd: projectRoot
        });
        gitInfo.isDirty = statusOutput.trim().length > 0;
      } catch (error) {
        console.warn('Could not check git status:', error);
        gitInfo.isDirty = null;
      }
      
      return NextResponse.json({
        success: true,
        hasGitRepo: true,
        gitInfo
      });
      
    } catch (error) {
      // .git folder doesn't exist
      return NextResponse.json({
        success: true,
        hasGitRepo: false,
        gitInfo: null
      });
    }
  } catch (error) {
    console.error('Error checking git repository:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check git repository' },
      { status: 500 }
    );
  }
}