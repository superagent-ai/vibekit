import inquirer from 'inquirer';
import chalk from 'chalk';
import {
  getAllProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  setCurrentProject,
  getCurrentProject,
  clearCurrentProject,
  validateProjectData,
  formatProjectsTable,
  formatProjectDetails
} from '../utils/projects.js';

export async function listProjects() {
  try {
    const projects = await getAllProjects();
    const currentProject = await getCurrentProject();
    
    console.log(chalk.blue('📂 VibeKit Projects'));
    console.log(chalk.gray('─'.repeat(50)));
    
    if (projects.length === 0) {
      console.log(chalk.yellow('No projects found'));
      console.log(chalk.gray('Use "vibekit projects add" to create your first project'));
      return;
    }
    
    if (currentProject) {
      console.log(chalk.green(`Current Project: ${currentProject.name} (${currentProject.id})`));
      console.log('');
    }
    
    console.log(formatProjectsTable(projects));
  } catch (error) {
    console.error(chalk.red('Failed to list projects:'), error.message);
  }
}

export async function showProject(id) {
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
    
    console.log(chalk.blue(`📂 Project Details`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(formatProjectDetails(project));
  } catch (error) {
    console.error(chalk.red('Failed to show project:'), error.message);
  }
}

export async function addProject() {
  try {
    console.log(chalk.blue('➕ Add New Project'));
    console.log(chalk.gray('─'.repeat(50)));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        validate: (input) => input.trim() ? true : 'Project name is required'
      },
      {
        type: 'input',
        name: 'gitRepoPath',
        message: 'Git repository path:',
        validate: (input) => input.trim() ? true : 'Git repository path is required'
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
    
    const projectData = {
      ...answers,
      tags
    };
    
    // Validate the project data
    const errors = await validateProjectData(projectData);
    if (errors.length > 0) {
      console.error(chalk.red('Validation errors:'));
      errors.forEach(error => console.error(chalk.red(`  • ${error}`)));
      return;
    }
    
    const project = await createProject(projectData);
    console.log(chalk.green(`✅ Project created successfully!`));
    console.log(chalk.gray(`Project ID: ${project.id}`));
    
    // Ask if they want to select this project
    const { selectProject } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'selectProject',
        message: 'Set this as your current project?',
        default: true
      }
    ]);
    
    if (selectProject) {
      await selectProjectById(project.id);
    }
    
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
        name: 'gitRepoPath',
        message: 'Git repository path:',
        default: project.gitRepoPath,
        validate: (input) => input.trim() ? true : 'Git repository path is required'
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
    
    // Validate the project data
    const errors = await validateProjectData(projectData);
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

export async function removeProject(id) {
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
    
    await deleteProject(id);
    console.log(chalk.green('✅ Project deleted successfully!'));
    
  } catch (error) {
    console.error(chalk.red('Failed to delete project:'), error.message);
  }
}

export async function selectProjectById(id) {
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
    
    await setCurrentProject(project);
    
    console.log(chalk.green(`✅ Selected project: ${project.name}`));
    console.log(chalk.blue(`📂 Repository: ${project.gitRepoPath}`));
    
    // Try to change to the project directory
    try {
      process.chdir(project.gitRepoPath);
      console.log(chalk.gray(`Working directory changed to: ${project.gitRepoPath}`));
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Could not change to project directory: ${error.message}`));
    }
    
  } catch (error) {
    console.error(chalk.red('Failed to select project:'), error.message);
  }
}

export async function showCurrentProject() {
  try {
    const currentProject = await getCurrentProject();
    
    if (!currentProject) {
      console.log(chalk.yellow('No project currently selected'));
      console.log(chalk.gray('Use "vibekit projects select <id>" to select a project'));
      return;
    }
    
    console.log(chalk.green(`Current Project: ${currentProject.name}`));
    console.log(chalk.blue(`Repository: ${currentProject.gitRepoPath}`));
    console.log(chalk.gray(`Project ID: ${currentProject.id}`));
    
  } catch (error) {
    console.error(chalk.red('Failed to show current project:'), error.message);
  }
}