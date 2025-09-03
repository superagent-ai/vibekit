import type { Project } from './types';
import { truncate } from './validator';

/**
 * Formats projects into a table string
 */
export function formatProjectsTable(projects: Project[], currentProject?: Project | null): string {
  if (projects.length === 0) {
    return 'No projects found';
  }
  
  // Calculate column widths (add 2 for the indicator)
  const maxIdLength = Math.max(6, ...projects.map(p => p.id.length));
  const maxNameLength = Math.max(20, ...projects.map(p => p.name.length));
  const maxPathLength = Math.max(30, ...projects.map(p => (p.projectRoot || '').length));
  const maxStatusLength = Math.max(8, ...projects.map(p => p.status.length));
  
  // Create header
  const header = `  ${'ID'.padEnd(maxIdLength)} | ${'Name'.padEnd(maxNameLength)} | ${'Project Root'.padEnd(maxPathLength)} | ${'Status'.padEnd(maxStatusLength)}`;
  const separator = '-'.repeat(header.length);
  
  // Create rows
  const rows = projects.map(project => {
    const isSelected = currentProject && currentProject.id === project.id;
    const indicator = isSelected ? '▸ ' : '  ';
    const id = project.id.padEnd(maxIdLength);
    const name = truncate(project.name, maxNameLength).padEnd(maxNameLength);
    const path = truncate(project.projectRoot || '', maxPathLength).padEnd(maxPathLength);
    const status = project.status.padEnd(maxStatusLength);
    
    return `${indicator}${id} | ${name} | ${path} | ${status}`;
  });
  
  return [header, separator, ...rows].join('\n');
}

/**
 * Formats project details into a string
 */
export function formatProjectDetails(project: Project): string {
  const lines = [
    `ID: ${project.id}`,
    `Name: ${project.name}`,
    `Project Root: ${project.projectRoot}`,
    `Status: ${project.status}`,
    `Created: ${new Date(project.createdAt).toLocaleString()}`,
    `Updated: ${new Date(project.updatedAt).toLocaleString()}`
  ];
  
  if (project.description) {
    lines.push(`Description: ${project.description}`);
  }
  
  if (project.tags && project.tags.length > 0) {
    lines.push(`Tags: ${project.tags.join(', ')}`);
  }
  
  if (project.setupScript) {
    lines.push(`Setup Script: ${project.setupScript}`);
  }
  
  if (project.devScript) {
    lines.push(`Dev Script: ${project.devScript}`);
  }
  
  if (project.cleanupScript) {
    lines.push(`Cleanup Script: ${project.cleanupScript}`);
  }
  
  return lines.join('\n');
}