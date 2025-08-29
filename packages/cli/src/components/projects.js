import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import {
  getAllProjects,
  getProject,
  getProjectByName,
  createProject,
  updateProject,
  deleteProject,
  validateProjectData,
  formatProjectsTableWithColor,
  formatProjectDetails,
  pathExists
} from '../utils/projects.js';

export async function listProjects() {
  try {
    const projects = await getAllProjects();
    
    console.log(chalk.blue('📂 VibeKit Projects'));
    console.log(chalk.gray('─'.repeat(50)));
    
    if (projects.length === 0) {
      console.log(chalk.yellow('No projects found'));
      console.log(chalk.gray('Use "vibekit projects add" to create your first project'));
      return;
    }
    
    console.log(formatProjectsTableWithColor(projects));
  } catch (error) {
    console.error(chalk.red('Failed to list projects:'), error.message);
  }
}

export async function showProject(idOrName, byName = false) {
  try {
    if (!idOrName) {
      console.error(chalk.red('Project ID or name is required'));
      return;
    }
    
    let project;
    if (byName) {
      // Search for project by name
      project = await getProjectByName(idOrName);
      if (!project) {
        console.error(chalk.red(`Project not found with name: ${idOrName}`));
        return;
      }
    } else {
      // Search by ID
      project = await getProject(idOrName);
      if (!project) {
        console.error(chalk.red(`Project not found with ID: ${idOrName}`));
        return;
      }
    }
    
    console.log(chalk.blue(`📂 Project Details`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(formatProjectDetails(project));
  } catch (error) {
    console.error(chalk.red('Failed to show project:'), error.message);
  }
}

export async function addProject(name, folder, description) {
  try {
    console.log(chalk.blue('➕ Add New Project'));
    console.log(chalk.gray('─'.repeat(50)));
    
    let projectData = {};
    
    // If name is provided, use command-line arguments
    if (name) {
      // Validate that folder is also provided
      if (!folder) {
        console.error(chalk.red('Error: When providing a project name, you must also provide a folder path'));
        console.log(chalk.gray('Usage: vibekit projects add <name> <folder> [description]'));
        console.log(chalk.gray('  Use "." for current directory'));
        return;
      }
      
      // Use current directory if folder is '.', otherwise use the provided folder
      // Convert relative paths to absolute paths
      let projectRoot;
      if (folder === '.') {
        projectRoot = process.cwd();
      } else if (path.isAbsolute(folder)) {
        projectRoot = folder;
      } else {
        projectRoot = path.resolve(process.cwd(), folder);
      }
      
      projectData = {
        name: name,
        projectRoot: projectRoot,
        description: description || '',
        tags: [],
        setupScript: '',
        devScript: '',
        cleanupScript: '',
        status: 'active'
      };
      
      console.log(chalk.gray(`Project Name: ${name}`));
      console.log(chalk.gray(`Project Path: ${projectRoot}`));
      if (description) {
        console.log(chalk.gray(`Description: ${description}`));
      }
    } else {
      // Interactive mode - ask all questions
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Project name:',
          validate: (input) => input.trim() ? true : 'Project name is required'
        },
        {
          type: 'input',
          name: 'projectRoot',
          message: 'Project root path:',
          validate: (input) => input.trim() ? true : 'Project root path is required'
        },
        {
          type: 'input',
          name: 'description',
          message: 'Description (optional):'
        },
        {
          type: 'input',
          name: 'tags',
          message: 'Tags (comma separated, optional):'
        },
        {
          type: 'input',
          name: 'setupScript',
          message: 'Setup script (optional):',
          default: ''
        },
        {
          type: 'input',
          name: 'devScript',
          message: 'Development script (optional):',
          default: ''
        },
        {
          type: 'input',
          name: 'cleanupScript',
          message: 'Cleanup script (optional):',
          default: ''
        },
        {
          type: 'list',
          name: 'status',
          message: 'Project status:',
          choices: ['active', 'archived'],
          default: 'active'
        }
      ]);
      
      // Process tags
      const tags = answers.tags ? 
        answers.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0) : [];
      
      projectData = {
        ...answers,
        tags
      };
    }
    
    // Check if the path exists
    const pathDoesExist = await pathExists(projectData.projectRoot);
    let shouldCreatePath = false;
    let shouldInitGit = false;
    
    if (!pathDoesExist) {
      console.log(chalk.yellow(`\n⚠️  Directory does not exist: ${projectData.projectRoot}`));
      
      // Ask if they want to create it
      const { confirmCreate } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmCreate',
          message: 'Would you like to create this directory and initialize a git repository?',
          default: true
        }
      ]);
      
      if (!confirmCreate) {
        console.log(chalk.gray('Project creation cancelled'));
        return;
      }
      
      shouldCreatePath = true;
      shouldInitGit = true;
    } else {
      // Check if it's already a git repository
      const isGitRepo = await pathExists(path.join(projectData.projectRoot, '.git'));
      
      if (!isGitRepo) {
        const { confirmInitGit } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmInitGit',
            message: 'This directory is not a git repository. Would you like to initialize git?',
            default: true
          }
        ]);
        shouldInitGit = confirmInitGit;
      }
    }
    
    // Create directory if needed
    if (shouldCreatePath) {
      try {
        await fs.ensureDir(projectData.projectRoot);
        console.log(chalk.green(`✅ Created directory: ${projectData.projectRoot}`));
      } catch (error) {
        console.error(chalk.red(`Failed to create directory: ${error.message}`));
        return;
      }
    }
    
    // Initialize git repository if needed
    if (shouldInitGit) {
      try {
        execSync('git init', { cwd: projectData.projectRoot, stdio: 'pipe' });
        console.log(chalk.green(`✅ Initialized git repository`));
        
        // Create initial commit if directory is new
        if (shouldCreatePath) {
          // Create a simple README file
          const readmePath = path.join(projectData.projectRoot, 'README.md');
          await fs.writeFile(readmePath, `# ${projectData.name}\n\n${projectData.description || 'A new project managed by VibeKit'}\n`);
          
          execSync('git add README.md', { cwd: projectData.projectRoot, stdio: 'pipe' });
          execSync('git commit -m "Initial commit"', { cwd: projectData.projectRoot, stdio: 'pipe' });
          console.log(chalk.green(`✅ Created initial commit with README.md`));
        }
      } catch (error) {
        console.error(chalk.yellow(`⚠️  Git initialization warning: ${error.message}`));
        // Continue anyway - git init failure shouldn't stop project creation
      }
    }
    
    // Now validate with allowNonExistent=false since we've handled creation
    const errors = await validateProjectData(projectData, false);
    if (errors.length > 0) {
      console.error(chalk.red('Validation errors:'));
      errors.forEach(error => console.error(chalk.red(`  • ${error}`)));
      return;
    }
    
    const project = await createProject(projectData);
    console.log(chalk.green(`✅ Project created successfully!`));
    console.log(chalk.gray(`Project ID: ${project.id}`));
    
  } catch (error) {
    console.error(chalk.red('Failed to add project:'), error.message);
  }
}

export async function editProject(id) {
  try {
    if (!id) {
      console.error(chalk.red('Project ID is required'));
      return;
    }
    
    const project = await getProject(id);
    if (!project) {
      console.error(chalk.red(`Project not found: ${id}`));
      return;
    }
    
    console.log(chalk.blue(`✏️ Edit Project: ${project.name}`));
    console.log(chalk.gray('─'.repeat(50)));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        default: project.name,
        validate: (input) => input.trim() ? true : 'Project name is required'
      },
      {
        type: 'input',
        name: 'projectRoot',
        message: 'Project root path:',
        default: project.projectRoot,
        validate: (input) => input.trim() ? true : 'Project root path is required'
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description:',
        default: project.description || ''
      },
      {
        type: 'input',
        name: 'tags',
        message: 'Tags (comma separated):',
        default: project.tags ? project.tags.join(', ') : ''
      },
      {
        type: 'input',
        name: 'setupScript',
        message: 'Setup script:',
        default: project.setupScript || ''
      },
      {
        type: 'input',
        name: 'devScript',
        message: 'Development script:',
        default: project.devScript || ''
      },
      {
        type: 'input',
        name: 'cleanupScript',
        message: 'Cleanup script:',
        default: project.cleanupScript || ''
      },
      {
        type: 'list',
        name: 'status',
        message: 'Project status:',
        choices: ['active', 'archived'],
        default: project.status
      }
    ]);
    
    // Process tags
    const tags = answers.tags ? 
      answers.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0) : [];
    
    const projectData = {
      ...answers,
      tags
    };
    
    // Validate the project data (allow non-existent for edit, since we're not creating)
    const errors = await validateProjectData(projectData, false);
    if (errors.length > 0) {
      console.error(chalk.red('Validation errors:'));
      errors.forEach(error => console.error(chalk.red(`  • ${error}`)));
      return;
    }
    
    await updateProject(id, projectData);
    console.log(chalk.green(`✅ Project updated successfully!`));
    
  } catch (error) {
    console.error(chalk.red('Failed to edit project:'), error.message);
  }
}

export async function removeMultipleProjects(idsOrNames, byName = false) {
  try {
    if (!idsOrNames || idsOrNames.length === 0) {
      console.error(chalk.red('At least one project ID or name is required'));
      return;
    }
    
    // If only one project, use the single removal function for backward compatibility
    if (idsOrNames.length === 1) {
      return await removeProject(idsOrNames[0], byName);
    }
    
    // Collect all projects to be deleted
    const projectsToDelete = [];
    const notFound = [];
    
    for (const idOrName of idsOrNames) {
      let project;
      if (byName) {
        // Search for project by name
        project = await getProjectByName(idOrName);
        if (!project) {
          notFound.push(`name: ${idOrName}`);
        }
      } else {
        // Search by ID
        project = await getProject(idOrName);
        if (!project) {
          notFound.push(`ID: ${idOrName}`);
        }
      }
      
      if (project) {
        projectsToDelete.push(project);
      }
    }
    
    // Report not found projects
    if (notFound.length > 0) {
      console.error(chalk.red('The following projects were not found:'));
      notFound.forEach(item => console.error(chalk.red(`  • ${item}`)));
      
      if (projectsToDelete.length === 0) {
        return;
      }
      console.log('');
    }
    
    // Display all projects to be deleted
    console.log(chalk.yellow(`⚠️ Delete ${projectsToDelete.length} Project${projectsToDelete.length > 1 ? 's' : ''}:`));
    console.log(chalk.gray('─'.repeat(50)));
    
    projectsToDelete.forEach(project => {
      console.log(chalk.yellow(`• ${project.name} (${project.id})`));
      if (project.description) {
        console.log(chalk.gray(`  ${project.description}`));
      }
    });
    console.log('');
    
    const { confirmDelete } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmDelete',
        message: chalk.red(`Are you sure you want to delete ${projectsToDelete.length} project${projectsToDelete.length > 1 ? 's' : ''}?`),
        default: false
      }
    ]);
    
    if (!confirmDelete) {
      console.log(chalk.gray('Delete cancelled'));
      return;
    }
    
    // Delete all projects
    let successCount = 0;
    for (const project of projectsToDelete) {
      try {
        await deleteProject(project.id);
        successCount++;
        console.log(chalk.green(`✅ Deleted: ${project.name}`));
      } catch (error) {
        console.error(chalk.red(`❌ Failed to delete ${project.name}: ${error.message}`));
      }
    }
    
    if (successCount > 0) {
      console.log(chalk.green(`\n✅ Successfully deleted ${successCount} project${successCount > 1 ? 's' : ''}!`));
    }
    
  } catch (error) {
    console.error(chalk.red('Failed to delete projects:'), error.message);
  }
}

export async function removeProject(idOrName, byName = false) {
  try {
    if (!idOrName) {
      console.error(chalk.red('Project ID or name is required'));
      return;
    }
    
    let project;
    if (byName) {
      // Search for project by name
      project = await getProjectByName(idOrName);
      if (!project) {
        console.error(chalk.red(`Project not found with name: ${idOrName}`));
        return;
      }
    } else {
      // Search by ID
      project = await getProject(idOrName);
      if (!project) {
        console.error(chalk.red(`Project not found with ID: ${idOrName}`));
        return;
      }
    }
    
    console.log(chalk.yellow(`⚠️ Delete Project: ${project.name}`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(formatProjectDetails(project));
    console.log('');
    
    const { confirmDelete } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmDelete',
        message: chalk.red('Are you sure you want to delete this project?'),
        default: false
      }
    ]);
    
    if (!confirmDelete) {
      console.log(chalk.gray('Delete cancelled'));
      return;
    }
    
    await deleteProject(project.id);
    console.log(chalk.green('✅ Project deleted successfully!'));
    
  } catch (error) {
    console.error(chalk.red('Failed to delete project:'), error.message);
  }
}

export async function selectProjectById(id) {
  try {
    if (!id) {
      console.error(chalk.red('Project ID is required'));
      return null;
    }
    
    const project = await getProject(id);
    if (!project) {
      console.error(chalk.red(`Project not found with ID: ${id}`));
      return null;
    }
    
    return project;
  } catch (error) {
    console.error(chalk.red('Failed to select project:'), error.message);
    return null;
  }
}

export async function showCurrentProject() {
  try {
    // Implementation to show current project - could get from context/config
    // For now, just return a message
    console.log(chalk.blue('📂 Current Project'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.gray('No current project selected'));
    console.log(chalk.gray('Use "vibekit projects list" to see all projects'));
  } catch (error) {
    console.error(chalk.red('Failed to show current project:'), error.message);
  }
}

