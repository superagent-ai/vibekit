import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const execAsync = promisify(exec);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get project details from storage
    const projectsPath = path.join(os.homedir(), '.vibekit', 'projects.json');
    
    try {
      const projectsData = await fs.readFile(projectsPath, 'utf-8');
      const projectsConfig = JSON.parse(projectsData);
      const projects = projectsConfig.projects || {};
      const project = projects[params.id];
      
      if (!project) {
        return NextResponse.json(
          { success: false, error: 'Project not found' },
          { status: 404 }
        );
      }

      // Check if the project directory exists and is a git repository
      const projectPath = project.projectRoot;
      
      // First check if the project directory itself exists
      try {
        await fs.access(projectPath);
      } catch (error) {
        return NextResponse.json({
          success: true,
          data: [],
          debug: {
            error: 'Project directory does not exist',
            projectPath,
            projectDetails: project
          }
        });
      }
      
      // Now check for .git folder
      try {
        const gitPath = path.join(projectPath, '.git');
        await fs.stat(gitPath);
      } catch (error: any) {
        return NextResponse.json({
          success: true,
          data: [],
          debug: {
            projectPath,
            gitPath: path.join(projectPath, '.git'),
            error: 'No .git folder found',
            errorDetails: error.message
          }
        });
      }

      // Get git log with a unique delimiter
      const delimiter = '|||COMMIT_DELIMITER|||';
      const gitCommand = `git log --pretty=format:'%H${delimiter}%s${delimiter}%an${delimiter}%ae${delimiter}%ai${delimiter}' -n 50`;
      
      try {
        const { stdout } = await execAsync(gitCommand, { cwd: projectPath });
        
        if (!stdout) {
          return NextResponse.json({
            success: true,
            data: [],
            debug: {
              message: 'No commits found in repository',
              projectPath
            }
          });
        }

        // Parse git log output
        const commits = stdout
          .split('\n')
          .filter(Boolean)
          .map(line => {
            // Remove quotes at start and end if present
            const cleanLine = line.replace(/^'|'$/g, '');
            const parts = cleanLine.split(delimiter);
            
            if (parts.length >= 5) {
              return {
                hash: parts[0],
                message: parts[1],
                author: parts[2],
                email: parts[3],
                date: parts[4]
              };
            }
            return null;
          })
          .filter(Boolean);
        
        return NextResponse.json({
          success: true,
          data: commits
        });
      } catch (gitError: any) {
        return NextResponse.json({
          success: true,
          data: [],
          debug: {
            error: 'Git command failed',
            message: gitError.message,
            projectPath
          }
        });
      }
    } catch (error) {
      console.error('Error reading projects:', error);
      return NextResponse.json({
        success: true,
        data: []
      });
    }
  } catch (error) {
    console.error('Error fetching git commits:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch git commits',
        data: []
      },
      { status: 500 }
    );
  }
}