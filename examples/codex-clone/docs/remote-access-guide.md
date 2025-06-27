# E2B Sandbox Remote Access Guide

This guide covers all methods for accessing and working with E2B sandboxes remotely, including terminal access, VS Code integration, port forwarding, and troubleshooting.

## Table of Contents

1. [Overview](#overview)
2. [Terminal Access](#terminal-access)
3. [VS Code Access](#vs-code-access)
4. [Port Forwarding & Application Preview](#port-forwarding--application-preview)
5. [SSH Configuration for Local VS Code](#ssh-configuration-for-local-vs-code)
6. [Troubleshooting](#troubleshooting)

## Overview

E2B provides secure, isolated sandbox environments for code execution. While direct SSH access may not be available, E2B offers comprehensive web-based access through:

- **Web Terminal**: Full terminal access through your browser
- **VS Code Web**: Complete VS Code development environment in the browser
- **Port Forwarding**: Access to running applications and services
- **File System Access**: Direct file management capabilities

## Terminal Access

### Web Terminal

The E2B web terminal provides full command-line access to your sandbox environment.

#### Accessing the Terminal

1. Navigate to your sandbox instance in the E2B dashboard
2. Click on the "Terminal" tab or button
3. The terminal will open in your browser with full shell access

#### Terminal Features

- **Full bash shell**: Complete Linux command-line environment
- **Package management**: Install packages using apt, npm, pip, etc.
- **File operations**: Create, edit, and manage files
- **Process management**: Run and monitor processes
- **Environment variables**: Set and manage environment configuration

#### Example Terminal Commands

```bash
# Check system information
uname -a

# Install packages
sudo apt-get update
sudo apt-get install -y nodejs npm

# Run applications
npm install
npm run dev

# Monitor processes
ps aux
top
```

## VS Code Access

E2B provides two methods for accessing VS Code with your sandbox:

### 1. VS Code Web Interface

The web-based VS Code provides a full IDE experience directly in your browser.

#### Accessing VS Code Web

1. From your E2B sandbox dashboard, click on "VS Code" or "Editor"
2. VS Code will open in a new browser tab
3. You'll have access to the full file system of your sandbox

#### Features

- **Full VS Code functionality**: Extensions, debugging, terminal integration
- **File explorer**: Navigate and edit all files in your sandbox
- **Integrated terminal**: Run commands without leaving VS Code
- **Git integration**: Full version control support
- **Extensions**: Install and use VS Code extensions

#### Tips for VS Code Web

```json
// Example VS Code settings for optimal web experience
{
  "editor.fontSize": 14,
  "editor.wordWrap": "on",
  "terminal.integrated.fontSize": 14,
  "workbench.colorTheme": "Default Dark+",
  "files.autoSave": "afterDelay",
  "files.autoSaveDelay": 1000
}
```

### 2. Remote Development (When Available)

Some E2B configurations may support VS Code Remote Development:

1. Install the "Remote - SSH" extension in your local VS Code
2. Use the connection details provided by E2B
3. Connect to your sandbox for a native VS Code experience

## Port Forwarding & Application Preview

E2B sandboxes support port forwarding to access web applications and services running in your sandbox.

### Setting Up Port Forwarding

1. **Automatic Port Detection**: E2B automatically detects common ports (3000, 8000, 8080, etc.)
2. **Manual Port Configuration**: Specify custom ports in your sandbox settings

### Accessing Forwarded Ports

```javascript
// Example: Running a Next.js application
// In your sandbox terminal:
npm run dev
// Default port 3000 will be automatically forwarded

// Access via:
// https://[sandbox-id].e2b.dev:3000
```

### Common Port Configurations

| Service | Default Port | Usage |
|---------|-------------|-------|
| Next.js | 3000 | Development server |
| React | 3000 | Development server |
| Node.js | 3000, 8080 | API servers |
| Python Flask | 5000 | Web applications |
| Python Django | 8000 | Web applications |
| PostgreSQL | 5432 | Database |
| MongoDB | 27017 | Database |

### Port Forwarding in Code

```javascript
// Example: Configuring your app for E2B port forwarding
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Important: Bind to all interfaces

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
```

## SSH Configuration for Local VS Code

While E2B primarily provides web-based access, some configurations may support SSH connections.

### If SSH is Available

1. **Get Connection Details**
   ```bash
   # From E2B dashboard, get:
   # - Hostname/IP
   # - Port (usually 22)
   # - Username
   # - Authentication method (key or password)
   ```

2. **Configure SSH Config**
   ```bash
   # ~/.ssh/config
   Host e2b-sandbox
     HostName [sandbox-hostname]
     Port 22
     User [username]
     IdentityFile ~/.ssh/e2b_key
     StrictHostKeyChecking no
   ```

3. **Connect with VS Code**
   ```bash
   # In VS Code:
   # 1. Install "Remote - SSH" extension
   # 2. Open Command Palette (Cmd/Ctrl + Shift + P)
   # 3. Select "Remote-SSH: Connect to Host"
   # 4. Choose "e2b-sandbox"
   ```

### Alternative: VS Code Server

If direct SSH isn't available, you can run code-server in your sandbox:

```bash
# Install code-server in your sandbox
curl -fsSL https://code-server.dev/install.sh | sh

# Run code-server
code-server --bind-addr 0.0.0.0:8080 --auth none

# Access via forwarded port
# https://[sandbox-id].e2b.dev:8080
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Terminal Not Loading

**Problem**: Web terminal shows blank screen or doesn't connect

**Solutions**:
- Clear browser cache and cookies
- Try a different browser (Chrome/Firefox recommended)
- Check if JavaScript is enabled
- Disable browser extensions that might interfere

#### 2. VS Code Web Performance Issues

**Problem**: VS Code web interface is slow or unresponsive

**Solutions**:
```javascript
// Optimize VS Code settings
{
  "files.exclude": {
    "**/node_modules": true,
    "**/.git": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true
  },
  "editor.minimap.enabled": false,
  "editor.renderWhitespace": "none"
}
```

#### 3. Port Forwarding Not Working

**Problem**: Cannot access application on forwarded port

**Solutions**:
```bash
# 1. Ensure app binds to 0.0.0.0, not localhost
# Bad:  app.listen(3000, 'localhost')
# Good: app.listen(3000, '0.0.0.0')

# 2. Check if port is actually listening
netstat -tlnp | grep 3000

# 3. Test locally first
curl http://localhost:3000

# 4. Check firewall rules
sudo iptables -L
```

#### 4. File Sync Issues

**Problem**: Files not appearing or changes not saving

**Solutions**:
- Ensure stable internet connection
- Check sandbox storage limits
- Verify file permissions
- Use explicit save commands (Ctrl/Cmd + S)

#### 5. Extension Installation Issues

**Problem**: VS Code extensions fail to install

**Solutions**:
```bash
# Install extensions via terminal
code --install-extension <extension-id>

# Or manually download and install
# 1. Download .vsix file
# 2. In VS Code: Extensions > ... > Install from VSIX
```

### Performance Optimization Tips

1. **Minimize Open Files**: Close unnecessary tabs
2. **Disable Unused Extensions**: Only keep essential extensions
3. **Use Terminal for Heavy Operations**: Run builds/tests in terminal instead of VS Code tasks
4. **Optimize Workspace Settings**: Exclude large directories from search/watch

### Getting Help

If you encounter issues not covered in this guide:

1. Check E2B documentation at [docs.e2b.dev](https://docs.e2b.dev)
2. Contact E2B support with:
   - Sandbox ID
   - Browser and version
   - Steps to reproduce the issue
   - Any error messages

## Best Practices

1. **Save Work Frequently**: Use auto-save or manual saves
2. **Use Version Control**: Commit changes regularly to Git
3. **Monitor Resources**: Check CPU/memory usage in sandbox
4. **Optimize for Web**: When possible, use lighter editors for quick edits
5. **Leverage Port Forwarding**: Test applications as they would appear to users

This guide provides comprehensive coverage of E2B sandbox remote access methods. The web-based tools offer a complete development experience without the need for complex SSH configurations, making it easy to code, test, and deploy from anywhere.