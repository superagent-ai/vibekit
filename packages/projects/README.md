# @vibe-kit/projects

A lightweight, zero-dependency project management library for VibeKit that provides a simple and efficient way to manage development projects and maintain project metadata.

## Features

- 🚀 **Zero Dependencies** - Uses only native Node.js APIs
- 📁 **Project Management** - Create, read, update, and delete projects
- 💾 **Persistent Storage** - JSON-based storage in `~/.vibekit` directory
- 🔍 **Multiple Query Methods** - Find projects by ID, name, or path
- ✅ **Built-in Validation** - Automatic validation of project data
- 📊 **Formatting Utilities** - Table and detailed view formatters
- 🧪 **Fully Tested** - Comprehensive unit and integration tests

## Installation

```bash
npm install @vibe-kit/projects
```

## Usage

### Basic Example

```typescript
import {
  createProject,
  getAllProjects
} from '@vibe-kit/projects';

// Create a new project
const project = await createProject({
  name: 'My Awesome Project',
  projectRoot: '/path/to/project',
  description: 'A cool project',
  tags: ['typescript', 'node'],
  setupScript: 'npm install',
  devScript: 'npm run dev'
});

// Get all projects
const projects = await getAllProjects();
```

## API Reference

### Project Management

#### `createProject(data: ProjectCreateInput): Promise<Project>`
Creates a new project with the provided data.

```typescript
const project = await createProject({
  name: 'Project Name',        // Required
  projectRoot: '/path/to/project', // Required
  description: 'Description',  // Optional
  tags: ['tag1', 'tag2'],      // Optional
  setupScript: 'npm install',  // Optional
  devScript: 'npm run dev',    // Optional
  cleanupScript: 'npm run clean', // Optional
  status: 'active'             // Optional, defaults to 'active'
});
```

#### `getAllProjects(): Promise<Project[]>`
Returns an array of all projects.

```typescript
const projects = await getAllProjects();
projects.forEach(p => console.log(p.name));
```

#### `getProject(id: string): Promise<Project | null>`
Gets a project by its ID.

```typescript
const project = await getProject('abc123');
```

#### `getProjectByName(name: string): Promise<Project | null>`
Gets a project by its name.

```typescript
const project = await getProjectByName('My Project');
```

#### `getProjectByPath(projectRoot: string): Promise<Project | null>`
Gets a project by its root path.

```typescript
const project = await getProjectByPath('/home/user/projects/myapp');
```

#### `updateProject(id: string, updates: ProjectUpdateInput): Promise<Project | null>`
Updates an existing project.

```typescript
const updated = await updateProject('abc123', {
  name: 'New Name',
  status: 'archived'
});
```

#### `deleteProject(id: string): Promise<boolean>`
Deletes a project by ID. Returns `true` if successful.

```typescript
const success = await deleteProject('abc123');
```


### Formatting Utilities

#### `formatProjectsTable(projects: Project[]): string`
Formats projects as a table for display.

```typescript
const projects = await getAllProjects();
console.log(formatProjectsTable(projects));
```

Output:
```
ID       | Name                 | Project Root                   | Status  
-----------------------------------------------------------------------------
abc123   | My Project          | /home/user/projects/myapp      | active  
def456   | Another Project     | /home/user/projects/another    | archived
```

#### `formatProjectDetails(project: Project): string`
Formats a single project with all details.

```typescript
const project = await getProject('abc123');
console.log(formatProjectDetails(project));
```

Output:
```
ID: abc123
Name: My Project
Project Root: /home/user/projects/myapp
Status: active
Description: A cool project
Tags: typescript, node
Setup Script: npm install
Dev Script: npm run dev
Created: 1/15/2024, 10:30:00 AM
Updated: 1/20/2024, 3:45:00 PM
```

### Storage Utilities

These lower-level utilities are available for direct file operations:

#### `ensureProjectsFile(): Promise<void>`
Ensures the `.vibekit` directory and `projects.json` file exist.

#### `readProjectsConfig(): Promise<ProjectsConfig>`
Reads the entire projects configuration.

#### `writeProjectsConfig(config: ProjectsConfig): Promise<void>`
Writes the projects configuration.

#### `pathExists(filePath: string): Promise<boolean>`
Checks if a file or directory exists.

### Validation Utilities

#### `validateProjectData(data: ProjectCreateInput | ProjectUpdateInput, allowNonExistentPath?: boolean): Promise<string[]>`
Validates project data and returns an array of error messages.

```typescript
const errors = await validateProjectData({
  name: '',
  projectRoot: ''
});
// errors: ['Project name is required', 'Project root path is required']
```

#### `generateProjectId(): string`
Generates a unique 8-character project ID.

```typescript
const id = generateProjectId(); // e.g., 'a3f8c2d1'
```

#### `truncate(str: string, maxLength: number): string`
Truncates a string to a maximum length with ellipsis.

```typescript
const truncated = truncate('Very long string', 10); // 'Very lo...'
```

## Types

### Project
```typescript
interface Project {
  id: string;
  name: string;
  projectRoot: string;
  setupScript?: string;
  devScript?: string;
  cleanupScript?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  description?: string;
  status: 'active' | 'archived';
}
```

### ProjectCreateInput
```typescript
interface ProjectCreateInput {
  name: string;
  projectRoot: string;
  setupScript?: string;
  devScript?: string;
  cleanupScript?: string;
  tags?: string[];
  description?: string;
  status?: 'active' | 'archived';
}
```

### ProjectUpdateInput
```typescript
interface ProjectUpdateInput {
  name?: string;
  projectRoot?: string;
  setupScript?: string;
  devScript?: string;
  cleanupScript?: string;
  tags?: string[];
  description?: string;
  status?: 'active' | 'archived';
}
```

### ProjectsConfig
```typescript
interface ProjectsConfig {
  version: string;
  projects: Record<string, Project>;
}
```

## Storage Location

All project data is stored in the user's home directory:
- **Projects Database**: `~/.vibekit/projects.json`

## Testing

The package includes comprehensive test coverage:

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

Test files are located in `src/__tests__/` and include:
- Unit tests for all modules
- Integration tests for complete workflows
- Edge case testing

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Watch mode for development
npm run dev

# Type checking
npm run type-check

# Clean build artifacts
npm run clean
```

## Architecture

The package is organized into focused modules:

- **`manager.ts`** - High-level project management operations
- **`storage.ts`** - File system operations and persistence
- **`validator.ts`** - Data validation and ID generation
- **`formatter.ts`** - Output formatting utilities
- **`types.ts`** - TypeScript type definitions
- **`constants.ts`** - Configuration constants
- **`index.ts`** - Public API exports

## Best Practices

1. **Always validate user input** - Use the validation utilities before creating/updating projects
2. **Handle null returns** - Many functions return `null` when items aren't found
3. **Use appropriate query methods** - Choose between ID, name, or path lookups based on your use case
4. **Check for existence** - Use `pathExists()` to verify paths before operations

## Error Handling

The library uses exceptions for critical errors and returns `null` for not-found scenarios:

```typescript
try {
  // This throws on validation errors
  const project = await createProject({
    name: '', // Invalid!
    projectRoot: ''
  });
} catch (error) {
  console.error('Validation failed:', error.message);
}

// This returns null for not found
const project = await getProject('nonexistent');
if (!project) {
  console.log('Project not found');
}
```

## Contributing

Contributions are welcome! Please ensure:
- All tests pass (`npm test`)
- Type checking passes (`npm run type-check`)
- New features include tests
- Documentation is updated

## License

MIT

## Changelog

### 0.0.1
- Initial release
- Core project management functionality
- JSON-based storage
- Zero dependencies implementation