import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { setupAliases } from '../utils/aliases.js';
import proxyManager from '../proxy/manager.js';
import dashboardManager from '../dashboard/manager.js';
import CFonts from 'cfonts';

const Settings = ({ showWelcome = false }) => {
  const [settings, setSettings] = useState({
    sandbox: {
      enabled: false,
      type: 'docker'
    },
    proxy: {
      enabled: true,
      redactionEnabled: true
    },
    analytics: {
      enabled: true
    },
    aliases: {
      enabled: false
    }
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentMenu, setCurrentMenu] = useState('main'); // 'main', 'analytics', 'proxy', 'sandbox', 'ide'
  const [logoRendered, setLogoRendered] = useState(false);
  const { exit } = useApp();

  const settingsPath = path.join(os.homedir(), '.vibekit', 'settings.json');

  const getMenuItems = () => {
    switch (currentMenu) {
      case 'main':
        return [
          {
            label: 'Analytics',
            description: 'Configure analytics and logging settings',
            action: 'open-analytics'
          },
          {
            label: 'Proxy',
            description: 'Configure proxy server settings',
            action: 'open-proxy'
          },
          {
            label: 'Sandbox',
            description: 'Configure sandbox isolation settings',
            action: 'open-sandbox'
          },
          {
            label: 'IDE',
            description: 'Configure IDE integrations and aliases',
            action: 'open-ide'
          },
          {
            label: 'Discord',
            description: 'Join our Discord community',
            action: 'open-discord'
          },
          {
            label: 'Exit',
            description: 'Exit settings menu',
            action: 'exit'
          }
        ];
      case 'analytics':
        return [
          {
            label: `Analytics: ${settings.analytics.enabled ? '✓ ON' : '✗ OFF'}`,
            description: 'Enable or disable analytics collection and logging',
            action: 'toggle-analytics'
          },
          {
            label: 'View Dashboard',
            description: 'Open analytics dashboard and usage statistics',
            action: 'view-dashboard'
          },
          {
            label: 'Back to Main Menu',
            description: 'Return to main settings menu',
            action: 'back-to-main'
          }
        ];
      case 'proxy':
        return [
          {
            label: `Proxy Server: ${settings.proxy.enabled ? '✓ ON' : '✗ OFF'}`,
            description: 'Enable or disable the proxy server functionality',
            action: 'toggle-proxy'
          },
          {
            label: `Redaction: ${settings.proxy.redactionEnabled ? '✓ ON' : '✗ OFF'}`,
            description: 'Toggle redaction of sensitive data in proxy logs',
            action: 'toggle-redaction'
          },
          {
            label: 'Back to Main Menu',
            description: 'Return to main settings menu',
            action: 'back-to-main'
          }
        ];
      case 'sandbox':
        return [
          {
            label: `Sandbox Isolation: ${settings.sandbox.enabled ? '✓ ON' : '✗ OFF'}`,
            description: 'Enable sandbox isolation for secure execution',
            action: 'toggle-sandbox'
          },
          {
            label: `Sandbox Type: ${settings.sandbox.type}`,
            description: 'Container runtime (docker/podman)',
            action: 'cycle-sandbox-type'
          },
          {
            label: 'Back to Main Menu',
            description: 'Return to main settings menu',
            action: 'back-to-main'
          }
        ];
      case 'ide':
        return [
          {
            label: `Global Aliases: ${settings.aliases.enabled ? '✓ ON (requires restart)' : '✗ OFF (requires restart)'}`,
            description: 'Create global "claude", "gemini" and "codex" commands',
            action: 'toggle-aliases'
          },
          {
            label: 'Back to Main Menu',
            description: 'Return to main settings menu',
            action: 'back-to-main'
          }
        ];
      default:
        return [];
    }
  };

  const menuItems = getMenuItems();

  useEffect(() => {
    const loadSettings = async () => {
      try {
        await fs.ensureDir(path.dirname(settingsPath));
        
        if (await fs.pathExists(settingsPath)) {
          const loadedSettings = await fs.readJson(settingsPath);
          setSettings(prevSettings => ({...prevSettings, ...loadedSettings}));
        }
      } catch (error) {
        // Use default settings if loading fails
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [settingsPath]);

  useEffect(() => {
    if (showWelcome && !logoRendered) {
      // Render the cfonts logo directly to stdout
      CFonts.say('VIBEKIT', {
        font: 'tiny',
        align: 'center',
        colors: ['gray'],
        background: 'transparent',
        letterSpacing: 1,
        lineHeight: 0,  // Minimize line height
        space: false,  // Disable extra space around the logo
        maxLength: '0',
        env: 'node'
      });
      setLogoRendered(true);
    }
  }, [showWelcome, logoRendered]);

  const saveSettings = async (newSettings) => {
    try {
      await fs.writeJson(settingsPath, newSettings, { spaces: 2 });
      setSettings(newSettings);
    } catch (error) {
      console.error('Failed to save settings:', error.message);
    }
  };

  // Check if we're in a TTY environment
  const isRawModeSupported = process.stdin.isTTY;

  if (isRawModeSupported) {
    useInput(async (input, key) => {
      if (loading) return;

      if (key.upArrow || input === 'k') {
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : menuItems.length - 1));
      } else if (key.downArrow || input === 'j') {
        setSelectedIndex(prev => (prev < menuItems.length - 1 ? prev + 1 : 0));
      } else if (key.leftArrow) {
        if (currentMenu !== 'main') {
          setCurrentMenu('main');
          setSelectedIndex(0);
        }
      } else if (key.return || input === ' ') {
      const selectedItem = menuItems[selectedIndex];
      
      switch (selectedItem.action) {
        case 'open-analytics':
          setCurrentMenu('analytics');
          setSelectedIndex(0);
          break;
        case 'open-proxy':
          setCurrentMenu('proxy');
          setSelectedIndex(0);
          break;
        case 'open-sandbox':
          setCurrentMenu('sandbox');
          setSelectedIndex(0);
          break;
        case 'open-ide':
          setCurrentMenu('ide');
          setSelectedIndex(0);
          break;
        case 'open-discord':
          // Open Discord invite link
          import('child_process').then(({ exec }) => {
            const openCmd = process.platform === 'darwin' ? 'open' : 
                           process.platform === 'win32' ? 'start' : 'xdg-open';
            exec(`${openCmd} https://discord.gg/spZ7MnqFT4`);
          });
          break;
        case 'back-to-main':
          setCurrentMenu('main');
          setSelectedIndex(0);
          break;
        case 'view-dashboard':
          // Exit settings and start analytics dashboard server
          exit();
          console.log('\n📊 Starting analytics dashboard server...');
          
          try {
            const dashboardServer = dashboardManager.getDashboardServer(3001);
            await dashboardServer.start();
            const status = dashboardServer.getStatus();
            
            if (status.running && status.url) {
              console.log(`Dashboard available at: ${status.url}`);
              
              // Open browser
              import('child_process').then(({ exec }) => {
                const openCmd = process.platform === 'darwin' ? 'open' : 
                               process.platform === 'win32' ? 'start' : 'xdg-open';
                exec(`${openCmd} ${status.url}`);
              });
            }
          } catch (error) {
            console.error('❌ Failed to start dashboard server:', error.message);
          }
          break;
        case 'toggle-proxy':
          const newProxySettings = {
            ...settings,
            proxy: {
              ...settings.proxy,
              enabled: !settings.proxy.enabled
            }
          };
          saveSettings(newProxySettings);
          
          // Auto-start proxy server if enabled and not already running
          if (newProxySettings.proxy.enabled && !proxyManager.isRunning()) {
            try {
              const proxyServer = proxyManager.getProxyServer(8080);
              await proxyServer.start();
            } catch (error) {
              console.error('\n❌ Failed to start proxy server:', error.message);
            }
          } else if (!newProxySettings.proxy.enabled && proxyManager.isRunning()) {
            // Stop proxy server if disabled
            proxyManager.stop();
          }
          break;
        case 'toggle-redaction':
          const newRedactionSettings = {
            ...settings,
            proxy: {
              ...settings.proxy,
              redactionEnabled: !settings.proxy.redactionEnabled
            }
          };
          saveSettings(newRedactionSettings);
          break;
        case 'toggle-analytics':
          const newAnalyticsSettings = {
            ...settings,
            analytics: {
              ...settings.analytics,
              enabled: !settings.analytics.enabled
            }
          };
          saveSettings(newAnalyticsSettings);
          break;
        case 'toggle-sandbox':
          const newSandboxSettings = {
            ...settings,
            sandbox: {
              ...settings.sandbox,
              enabled: !settings.sandbox.enabled
            }
          };
          saveSettings(newSandboxSettings);
          break;
        case 'cycle-sandbox-type':
          const types = ['docker', 'podman'];
          const currentIndex = types.indexOf(settings.sandbox.type);
          const nextType = types[(currentIndex + 1) % types.length];
          const newSandboxTypeSettings = {
            ...settings,
            sandbox: {
              ...settings.sandbox,
              type: nextType
            }
          };
          saveSettings(newSandboxTypeSettings);
          break;
        case 'toggle-aliases':
          const newAliasSettings = {
            ...settings,
            aliases: {
              ...settings.aliases,
              enabled: !settings.aliases.enabled
            }
          };
          saveSettings(newAliasSettings);
          
          // Automatically setup aliases based on new setting
          setupAliases(newAliasSettings.aliases.enabled).catch(error => {
            console.error('Failed to setup aliases:', error.message);
          });
          break;
        case 'exit':
          exit();
          break;
      }
      } else if (key.escape || input === 'q') {
        if (currentMenu !== 'main') {
          setCurrentMenu('main');
          setSelectedIndex(0);
        } else {
          exit();
        }
      }
    });
  }

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="blue">⚙️  Loading settings...</Text>
      </Box>
    );
  }

  const getMenuTitle = () => {
    switch (currentMenu) {
      case 'main':
        return '🖖 VibeKit Settings';
      case 'analytics':
        return '📊 Analytics Settings';
      case 'proxy':
        return '🔌 Proxy Settings';
      case 'sandbox':
        return '📦 Sandbox Settings';
      case 'ide':
        return '💻 IDE Settings';
      default:
        return '🖖 VibeKit Settings';
    }
  };

  const getNavigationText = () => {
    if (!isRawModeSupported) {
      return 'Run with a terminal to enable interactive mode';
    }
    if (currentMenu === 'main') {
      return 'Use ↑/↓/←/→ to navigate, Enter/Space to select, q/Esc to exit';
    } else {
      return 'Use ↑/↓/←/→ to navigate, ← or q/Esc to go back, Enter/Space to select';
    }
  };

  return (
    <Box flexDirection="column" padding={1} alignItems={showWelcome ? "center" : undefined}>
      {showWelcome && (
        <>
          <Box justifyContent="center" marginBottom={2}>
            <Text color="gray">The safety layer for coding agents</Text>
          </Box>
        </>
      )}
      
      <Box flexDirection="column" alignItems={showWelcome ? "center" : undefined}>
        {!showWelcome && (
          <>
            <Text color="blue" bold>{getMenuTitle()}</Text>
            <Text> </Text>
          </>
        )}
        
        <Box flexDirection="column">
          {menuItems.map((item, index) => (
            <Box key={index} marginY={0}>
              <Text color={index === selectedIndex ? 'cyan' : 'white'}>
                {index === selectedIndex ? '❯ ' : '  '}
                {item.label.includes('✓ ON') ? (
                  <>
                    {item.label.replace(/✓ ON.*/, '')}
                    <Text color="green">✓ ON</Text>
                    {item.label.includes('(requires restart)') && (
                      <Text color="gray" dimColor> (requires restart)</Text>
                    )}
                  </>
                ) : item.label.includes('✗ OFF') ? (
                  <>
                    {item.label.replace(/✗ OFF.*/, '')}
                    <Text color="red">✗ OFF</Text>
                    {item.label.includes('(requires restart)') && (
                      <Text color="gray" dimColor> (requires restart)</Text>
                    )}
                  </>
                ) : (
                  item.label
                )}
              </Text>
            </Box>
          ))}
        </Box>

        {!showWelcome && (
          <>
            <Text> </Text>
            <Text color="gray">{getNavigationText()}</Text>
          </>
        )}
        
        {showWelcome && (
          <>
            <Text> </Text>
            <Box flexDirection="column" alignItems="center" marginTop={1}>
              <Text color="gray" dimColor>Quick Commands:</Text>
              <Box flexDirection="column" marginTop={1}>
                <Text color="gray" dimColor>  vibekit claude        Run Claude Code CLI</Text>
                <Text color="gray" dimColor>  vibekit gemini        Run Gemini CLI</Text>
                <Text color="gray" dimColor>  vibekit codex         Run Codex CLI</Text>
                <Text color="gray" dimColor>  vibekit cursor-agent  Run Cursor Agent</Text>
                <Text color="gray" dimColor>  vibekit opencode      Run OpenCode CLI</Text>
                <Text color="gray" dimColor>  vibekit              Configure settings</Text>
                <Text color="gray" dimColor>  vibekit dashboard     Open analytics dashboard</Text>
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default Settings;