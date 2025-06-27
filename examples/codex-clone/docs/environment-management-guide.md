# Environment Management Guide

## Overview

The enhanced environment management system allows you to specify environments with expiry times and different sharing strategies. You can configure a single environment as default for reuse across multiple repositories, create throwaway environments, or set up one environment per repository.

## Environment Features

### Sharing Strategies

1. **Default Environment**
   - Single persistent environment used across all repositories
   - Automatically selected for new tasks
   - Ideal for consistent development across projects

2. **Per-Repository Environment**
   - One dedicated environment per repository
   - Maintains repository-specific configurations
   - Automatically selected based on repository

3. **Throwaway Environment**
   - New environment created for each task
   - Automatically cleaned up after use
   - No persistence between tasks

4. **Manual Environment**
   - User manually selects environment for each task
   - Full control over environment usage
   - Default behavior

### Expiry and Auto-Extension

- **Expiry Date**: Set when environment should automatically expire
- **Auto-Extend**: Automatically extend environment when used
- **Extension Duration**: How many hours to extend (default: 1 hour)
- **Max Extensions**: Limit on number of auto-extensions
- **Usage Tracking**: Track when environment was last used

### Sandbox Configuration

- **E2B Template**: Choose specific sandbox template
- **Timeout**: Set sandbox timeout (max 1 hour for E2B)
- **Environment Variables**: Configure custom environment variables

## Using the Environment System

### Creating Environments

1. Navigate to **Settings** → **Environments**
2. Click **Create Environment**
3. Fill in basic information:
   - Name and description
   - Select repository
4. Configure sharing strategy:
   - Choose how environment should be used
   - Set as default if needed
5. Set expiry and auto-extension:
   - Optional expiry date
   - Auto-extend settings
6. Configure sandbox settings:
   - E2B template
   - Environment variables

### Environment Management

#### Environment List Features

- **Status Indicators**: Active, expired, expiring soon
- **Sharing Strategy**: Visual indication of strategy type
- **Expiry Information**: Time until expiry, extension count
- **Usage Tracking**: Creation and last used dates

#### Available Actions

- **Set as Default**: Make environment the default choice
- **Extend**: Manually extend environment lifetime
- **Delete**: Remove environment permanently
- **Auto-Cleanup**: Expired environments are automatically cleaned up

### Task Creation

When creating tasks, the system automatically:

1. **Default Strategy**: Uses default environment if available
2. **Per-Repo Strategy**: Finds environment for specific repository
3. **Manual Strategy**: Shows environment selector
4. **Usage Tracking**: Marks environment as used
5. **Auto-Extension**: Extends environment if configured

## Environment Health Monitoring

### Automatic Cleanup

- Runs every 5 minutes in the background
- Cleans up expired throwaway environments
- Preserves default environments (manual cleanup required)

### Health Indicators

- **Total Environments**: Count of all environments
- **Active Environments**: Currently usable environments
- **Expired Environments**: Environments past expiry date
- **Expiring Soon**: Environments expiring within 24 hours

## Best Practices

### For Development Teams

1. **Use Default Environment** for consistent team development
2. **Set reasonable expiry times** (24-48 hours for active development)
3. **Enable auto-extend** for frequently used environments
4. **Use per-repo strategy** for project-specific configurations

### For Individual Developers

1. **Use manual strategy** for full control
2. **Create throwaway environments** for experimental work
3. **Set up environment variables** for project-specific needs
4. **Monitor expiry dates** to avoid losing work

### For CI/CD

1. **Use throwaway environments** for automated testing
2. **Set short expiry times** to reduce resource usage
3. **Configure specific templates** for testing requirements

## Troubleshooting

### Common Issues

1. **Environment Expired**
   - Solution: Create new environment or extend existing one
   - Prevention: Enable auto-extend or set longer expiry

2. **No Default Environment**
   - Solution: Set an environment as default
   - Prevention: Always have one default environment

3. **Max Extensions Reached**
   - Solution: Create new environment
   - Prevention: Set higher max extensions or no limit

4. **Sandbox Connection Failed**
   - Solution: Check E2B API key and template
   - Prevention: Use verified templates and configurations

### Environment Recovery

If environments are accidentally deleted:
1. Check expired environments cleanup
2. Create new environment with same configuration
3. Use repository history to restore environment variables

## API Reference

### Environment Store Methods

```typescript
// Get default environment
const defaultEnv = getDefaultEnvironment();

// Set environment as default
setDefaultEnvironment(environmentId);

// Extend environment
const success = extendEnvironment(environmentId, hours);

// Mark environment as used
markEnvironmentUsed(environmentId);

// Get expired environments
const expired = getExpiredEnvironments();

// Cleanup expired environments
cleanupExpiredEnvironments();

// Find environment for repository
const env = getEnvironmentForRepository(repository);
```

### Environment Manager

```typescript
// Mark environment as used (with auto-extension)
markUsed(environmentId);

// Get environment health statistics
const health = getHealth();

// Extend environment if needed
const extended = extendIfNeeded(environmentId);
```

## Migration Guide

### From Simple Environment System

1. Existing environments will use "manual" sharing strategy
2. No expiry dates are set (environments persist indefinitely)
3. Auto-extend is disabled by default
4. Update environments to use new features as needed

### Updating Existing Environments

1. Edit environment to set sharing strategy
2. Add expiry date if desired
3. Configure auto-extend settings
4. Set up sandbox configuration

The enhanced environment system provides powerful tools for managing development environments while maintaining backward compatibility with existing setups.