# Environment Editing and Sandbox Regeneration Guide

This guide covers the new environment editing functionality and sandbox regeneration features in VibeKit.

## Overview

The environment editing system allows you to:
- ✅ **Edit existing environment configurations** without recreating them
- ✅ **Regenerate sandbox instances** when configuration changes
- ✅ **Update environment settings** like expiry, auto-extension, and sharing strategies
- ✅ **Modify sandbox configurations** including templates and environment variables
- ✅ **Force recreation of sandboxes** while preserving environment settings

## Features Added

### 1. Environment Editing UI

#### Edit Button
- Added "Edit Environment" option to the dropdown menu in environments list
- Available for all environments regardless of status
- Opens the enhanced environment dialog in edit mode

#### Form Pre-population
- Automatically populates all fields with existing environment data
- Handles complex data types like dates, environment variables, and sandbox configurations
- Preserves original settings while allowing modifications

#### Visual Indicators
- Dialog title changes to show "Edit Environment: [Name]" 
- Button text changes to "Update Environment" vs "Create Environment"
- Different loading states for update vs create operations

### 2. Sandbox Regeneration

#### Regenerate Option
- **Available only in edit mode** - checkbox to force new sandbox creation
- **Warning messages** about data loss when regenerating
- **Smart logic** to handle both new and existing sandbox configurations

#### How Regeneration Works
1. When `Regenerate Sandbox` is enabled, the system:
   - Ignores existing sandbox IDs in the configuration
   - Forces creation of a new sandbox instance
   - Preserves all other environment settings
   - Updates the environment with new sandbox information

#### Use Cases for Regeneration
- **Configuration Changes**: When you modify templates or environment variables
- **Sandbox Corruption**: When current sandbox has issues
- **Fresh Start**: When you want a clean sandbox environment
- **Template Updates**: When switching to different E2B templates

### 3. Enhanced Environment Store

#### New Update Functionality
```typescript
updateEnvironment: (
  id: string, 
  updates: Partial<Omit<Environment, "id" | "createdAt" | "updatedAt">>
) => void
```

#### Regeneration Support
- Added `forceRegenerate` flag to sandbox configurations
- Enhanced environment processing to handle regeneration requests
- Automatic timestamp updates on environment changes

### 4. System Integration

#### Task Creation Enhancement
- Environment configurations now passed to task creation
- Sandbox regeneration flags processed during task execution
- Improved environment selection in task forms

#### Core Sandbox Service Updates
- Enhanced `createSandboxConfigFromEnvironment` function
- Added `forceRegenerate` parameter support
- Smart handling of existing vs new sandbox creation

## How to Use

### Editing an Environment

1. **Navigate to Environments**
   - Go to Settings → Environments
   - Find the environment you want to edit

2. **Open Edit Dialog**
   - Click the "⋯" (more) button for the environment
   - Select "Edit Environment" from the dropdown

3. **Make Changes**
   - Modify any settings in the three tabs:
     - **Basic Info**: Name, description, repository
     - **Sharing & Expiry**: Strategy, expiry settings, auto-extension
     - **Sandbox Config**: Template, existing sandbox selection, environment variables

4. **Regenerate Sandbox (Optional)**
   - In the Sandbox Config tab, toggle "Regenerate Sandbox"
   - Read the warning about data loss
   - This will create a completely fresh sandbox

5. **Save Changes**
   - Click "Update Environment"
   - Changes are saved immediately
   - Environment is ready for use with new configuration

### When to Regenerate Sandboxes

**✅ Regenerate When:**
- Changing E2B templates (e.g., from vibekit-codex to vibekit-claude)
- Adding/modifying environment variables
- Sandbox becomes unresponsive or corrupted
- You want a completely clean environment
- Switching from existing sandbox to new sandbox

**❌ Don't Regenerate When:**
- Only changing environment name or description
- Modifying expiry settings or sharing strategy
- You have important unsaved work in the current sandbox
- Just extending environment lifetime

### Environment Variables Management

#### Adding Environment Variables
1. In the Sandbox Config tab
2. Use the key-value pairs section
3. Add multiple variables as needed
4. Empty pairs are automatically added

#### Editing Existing Variables
1. Variables from existing environments are pre-populated
2. Modify values directly in the form
3. Remove variables by clicking "Remove" button
4. Changes require environment update to take effect

### Advanced Configuration

#### Existing Sandbox Selection
- When editing, you can switch between "New Sandbox" and "Existing Sandbox"
- Refresh button loads current running sandboxes
- Select from dropdown of available sandboxes
- Warning shown about timeout limitations for existing sandboxes

#### Regeneration Flag Processing
```typescript
// Environment configuration with regeneration
const environmentData = {
  // ... other environment settings
  sandboxConfig: {
    template: "vibekit-claude",
    timeoutMs: 3600000,
    environment: { NODE_ENV: "development" },
    forceRegenerate: true  // Force new sandbox creation
  }
}
```

## Technical Implementation

### Core Changes

1. **Enhanced Environment Dialog**
   - Added `editingEnvironment` prop support
   - Form pre-population logic
   - Regeneration checkbox and warnings

2. **Environment Store Updates**
   - `updateEnvironment` function for modifications
   - Support for `forceRegenerate` flag in sandbox configs
   - Automatic timestamp management

3. **Sandbox Service Enhancement**
   - Modified `createSandboxConfigFromEnvironment` 
   - Added `forceRegenerate` parameter handling
   - Smart existing sandbox ID processing

4. **Task Creation Integration**
   - Environment data passed to task creation
   - Inngest function updated to process environment configs
   - Enhanced configuration building logic

### Error Handling

#### Common Issues and Solutions

**Environment Update Fails**
- Check repository access permissions
- Verify GitHub token is still valid
- Ensure environment name is unique

**Sandbox Regeneration Issues**
- Confirm E2B API key is configured
- Check template availability
- Verify timeout settings (max 1 hour)

**Missing Environment Variables**
- Variables may take time to propagate
- Check for typos in key names
- Verify values don't contain invalid characters

## Security Considerations

### Environment Variables
- Sensitive values are stored in browser localStorage
- Use environment-specific tokens when possible
- Regularly rotate API keys and secrets

### Sandbox Access
- Existing sandbox IDs are preserved securely
- Regeneration creates new instances with fresh access
- Previous sandbox instances may remain accessible until timeout

## Best Practices

### Environment Management
1. **Descriptive Names**: Use clear, descriptive environment names
2. **Regular Updates**: Keep configurations up to date
3. **Expiry Management**: Set reasonable expiry times
4. **Strategy Selection**: Choose appropriate sharing strategies

### Regeneration Guidelines
1. **Backup Important Work**: Save any important files before regenerating
2. **Test Configuration Changes**: Use throwaway environments for testing
3. **Document Changes**: Keep track of configuration modifications
4. **Monitor Resource Usage**: Be aware of E2B usage when regenerating frequently

### Troubleshooting

#### Environment Won't Update
- Check for validation errors in form fields
- Ensure required fields are filled
- Verify repository permissions

#### Regeneration Not Working
- Confirm E2B API access
- Check template availability
- Verify environment variable format

#### Sandbox Connection Issues
- Try regenerating the sandbox
- Check E2B service status
- Verify API key configuration

## Future Enhancements

### Planned Features
- **Bulk Environment Operations**: Edit multiple environments at once
- **Configuration Templates**: Save and reuse common configurations
- **Environment Cloning**: Duplicate existing environments
- **Advanced Validation**: Better error messages and validation
- **Audit Trail**: Track changes to environment configurations

### Integration Improvements
- **Better Error Handling**: More specific error messages
- **Progress Indicators**: Show regeneration progress
- **Resource Monitoring**: Track sandbox usage and costs
- **Automated Cleanup**: Smart cleanup of unused environments

---

This enhanced environment editing system provides powerful tools for managing development environments while maintaining safety and flexibility. The regeneration feature ensures you can always get a fresh start when needed, while the editing capabilities allow for fine-tuning without recreation. 