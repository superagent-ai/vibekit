import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const execAsync = promisify(exec);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; hash: string } }
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

      const projectPath = project.projectRoot;
      
      // Check if the project directory exists and is a git repository
      try {
        await fs.access(path.join(projectPath, '.git'));
      } catch {
        return NextResponse.json({
          success: false,
          error: 'Not a git repository'
        });
      }

      // Get commit details
      const commitCommand = `git show --format=fuller ${params.hash}`;
      const statsCommand = `git show --stat --format= ${params.hash}`;
      const filesCommand = `git diff-tree --no-commit-id --name-status -r ${params.hash}`;
      
      try {
        // Get full commit details with diff
        const [commitResult, statsResult, filesResult] = await Promise.all([
          execAsync(commitCommand, { cwd: projectPath, maxBuffer: 1024 * 1024 * 10 }), // 10MB buffer for large diffs
          execAsync(statsCommand, { cwd: projectPath }),
          execAsync(filesCommand, { cwd: projectPath })
        ]);

        // Parse the commit info
        const lines = commitResult.stdout.split('\n');
        let commitInfo: any = {
          hash: params.hash,
          message: '',
          author: '',
          authorEmail: '',
          authorDate: '',
          committer: '',
          committerEmail: '',
          commitDate: '',
          diff: '',
          stats: statsResult.stdout.trim(),
          files: []
        };

        // Parse commit metadata
        let inDiff = false;
        let inMessage = false;
        let messageLines: string[] = [];
        let diffLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith('commit ')) {
            commitInfo.fullHash = line.replace('commit ', '');
          } else if (line.startsWith('Author:')) {
            const authorMatch = line.match(/Author:\s+(.+?)\s+<(.+?)>/);
            if (authorMatch) {
              commitInfo.author = authorMatch[1];
              commitInfo.authorEmail = authorMatch[2];
            }
          } else if (line.startsWith('AuthorDate:')) {
            commitInfo.authorDate = line.replace('AuthorDate:', '').trim();
          } else if (line.startsWith('Commit:')) {
            const committerMatch = line.match(/Commit:\s+(.+?)\s+<(.+?)>/);
            if (committerMatch) {
              commitInfo.committer = committerMatch[1];
              commitInfo.committerEmail = committerMatch[2];
            }
          } else if (line.startsWith('CommitDate:')) {
            commitInfo.commitDate = line.replace('CommitDate:', '').trim();
            inMessage = true;
          } else if (line.startsWith('diff --git')) {
            inMessage = false;
            inDiff = true;
            diffLines.push(line);
          } else if (inDiff) {
            diffLines.push(line);
          } else if (inMessage && !inDiff) {
            messageLines.push(line);
          }
        }

        commitInfo.message = messageLines.join('\n').trim();
        commitInfo.diff = diffLines.join('\n');

        // Parse files changed
        if (filesResult.stdout) {
          commitInfo.files = filesResult.stdout.split('\n').filter(Boolean).map(line => {
            const [status, ...pathParts] = line.split('\t');
            return {
              status: status,
              statusText: getStatusText(status),
              path: pathParts.join('\t')
            };
          });
        }

        // Get individual file diffs
        const fileDiffs: any[] = [];
        for (const file of commitInfo.files) {
          try {
            const fileDiffCommand = `git diff ${params.hash}~1 ${params.hash} -- "${file.path}"`;
            const { stdout } = await execAsync(fileDiffCommand, { 
              cwd: projectPath,
              maxBuffer: 1024 * 1024 * 2 // 2MB per file
            });
            fileDiffs.push({
              path: file.path,
              status: file.status,
              statusText: file.statusText,
              diff: stdout
            });
          } catch {
            // File might be new or deleted, try different approach
            try {
              const showFileCommand = `git show ${params.hash}:"${file.path}"`;
              const { stdout } = await execAsync(showFileCommand, { 
                cwd: projectPath,
                maxBuffer: 1024 * 1024 * 2
              });
              fileDiffs.push({
                path: file.path,
                status: file.status,
                statusText: file.statusText,
                content: stdout,
                isNew: file.status === 'A'
              });
            } catch {
              // File was deleted or renamed
              fileDiffs.push({
                path: file.path,
                status: file.status,
                statusText: file.statusText,
                diff: '',
                isDeleted: file.status === 'D'
              });
            }
          }
        }

        commitInfo.fileDiffs = fileDiffs;

        return NextResponse.json({
          success: true,
          data: commitInfo
        });
      } catch (gitError: any) {
        return NextResponse.json({
          success: false,
          error: 'Failed to get commit details',
          message: gitError.message
        });
      }
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: 'Failed to read project data'
      });
    }
  } catch (error) {
    console.error('Error fetching commit details:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch commit details'
      },
      { status: 500 }
    );
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case 'A': return 'Added';
    case 'M': return 'Modified';
    case 'D': return 'Deleted';
    case 'R': return 'Renamed';
    case 'C': return 'Copied';
    case 'U': return 'Updated';
    default: return status;
  }
}