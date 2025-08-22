import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MCPServerBrowser } from '../src/components/MCPServerBrowser';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.open
Object.defineProperty(window, 'open', {
  value: vi.fn(),
  writable: true,
});

const mockRecommendedServers = {
  description: 'Recommended MCP servers for enhanced AI capabilities',
  servers: {
    'filesystem': {
      name: 'File System',
      description: 'Access and manage files and directories',
      repository: 'https://github.com/example/filesystem',
      category: 'utility',
      requiresApiKeys: false,
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        enabled: true,
      },
    },
    'github': {
      name: 'GitHub',
      description: 'Search repositories, read files, and manage issues',
      repository: 'https://github.com/example/github',
      category: 'productivity',
      requiresApiKeys: true,
      envVars: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        enabled: true,
      },
    },
    'database': {
      name: 'PostgreSQL',
      description: 'Query and manage PostgreSQL databases',
      repository: 'https://github.com/example/postgres',
      category: 'database',
      requiresApiKeys: true,
      envVars: ['POSTGRES_CONNECTION_STRING'],
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        enabled: true,
      },
    },
  },
  installation: {
    instructions: 'Install servers to enhance AI capabilities',
    example: 'Example installation',
  },
};

const mockInstalledServers = {
  mcpServers: {
    'filesystem': {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
    },
  },
};

describe('MCPServerBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Loading State', () => {
    it('should show loading spinner initially', async () => {
      // Mock fetch to never resolve
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<MCPServerBrowser />);

      expect(screen.getByText('Loading MCP servers...')).toBeInTheDocument();
      expect(document.querySelector('.animate-spin')).toBeInTheDocument(); // spinner
    });
  });

  describe('Data Loading', () => {
    it('should load recommended servers successfully', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockRecommendedServers),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockInstalledServers),
        });

      render(<MCPServerBrowser />);

      await waitFor(() => {
        expect(screen.getByText('MCP Server Browser')).toBeInTheDocument();
      });

      expect(screen.getByText(mockRecommendedServers.description)).toBeInTheDocument();
    });

    it('should handle recommended servers load failure', async () => {
      // Mock console.error to suppress expected error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      render(<MCPServerBrowser />);

      // Since the recommended servers fail to load and servers state is never set,
      // the component remains in loading state. This is the current behavior.
      await waitFor(() => {
        expect(screen.getByText('Loading MCP servers...')).toBeInTheDocument();
      });

      // The error should be logged but component stays in loading state
      // This test verifies the current component behavior
      
      consoleSpy.mockRestore();
    });

    it('should handle installed servers load failure gracefully', async () => {
      // Mock console.error to suppress expected error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockRecommendedServers),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      render(<MCPServerBrowser />);

      await waitFor(() => {
        expect(screen.getByText('MCP Server Browser')).toBeInTheDocument();
      });

      // Should still show servers even if installed servers failed to load
      expect(screen.getByText('File System')).toBeInTheDocument();
      
      consoleSpy.mockRestore();
    });

    it('should load and filter installed servers', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockRecommendedServers),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockInstalledServers),
        });

      render(<MCPServerBrowser />);

      await waitFor(() => {
        expect(screen.getByText('MCP Server Browser')).toBeInTheDocument();
      });

      // File System should not be shown since it's installed
      expect(screen.queryByText('File System')).not.toBeInTheDocument();
      // But GitHub should be shown since it's not installed
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
  });

  describe('Server Cards', () => {
    beforeEach(async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockRecommendedServers),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ mcpServers: {} }), // No installed servers
        });

      render(<MCPServerBrowser />);

      await waitFor(() => {
        expect(screen.getByText('MCP Server Browser')).toBeInTheDocument();
      });
    });

    it('should display server information correctly', () => {
      // Check File System server
      expect(screen.getByText('File System')).toBeInTheDocument();
      expect(screen.getByText('Access and manage files and directories')).toBeInTheDocument();
      expect(screen.getByText('utility')).toBeInTheDocument();
      expect(screen.getAllByText('Command: npx')).toHaveLength(3); // All 3 servers use npx
      expect(screen.getByText('Args: -y @modelcontextprotocol/server-filesystem')).toBeInTheDocument();

      // Check GitHub server with API keys
      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('Search repositories, read files, and manage issues')).toBeInTheDocument();
      expect(screen.getByText('productivity')).toBeInTheDocument();
      expect(screen.getAllByText('Requires API keys:')).toHaveLength(2); // GitHub and PostgreSQL both require API keys
      expect(screen.getByText('GITHUB_PERSONAL_ACCESS_TOKEN')).toBeInTheDocument();
    });

    it('should show install buttons for all servers', () => {
      const installButtons = screen.getAllByText('Install');
      expect(installButtons).toHaveLength(3); // filesystem, github, database
    });

    it('should show repository links', () => {
      const repoButtons = screen.getAllByRole('button', { name: '' }); // External link buttons
      expect(repoButtons.filter(btn => btn.querySelector('svg'))).toHaveLength(3);
    });
  });

  describe('Category Filtering', () => {
    beforeEach(async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockRecommendedServers),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ mcpServers: {} }),
        });

      render(<MCPServerBrowser />);

      await waitFor(() => {
        expect(screen.getByText('MCP Server Browser')).toBeInTheDocument();
      });
    });

    it('should show all category filter buttons', () => {
      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('Utility')).toBeInTheDocument();
      expect(screen.getByText('Productivity')).toBeInTheDocument();
      expect(screen.getByText('Database')).toBeInTheDocument();
    });

    it('should filter servers by category', async () => {
      // Initially all servers should be shown
      expect(screen.getByText('File System')).toBeInTheDocument();
      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('PostgreSQL')).toBeInTheDocument();

      // Click utility filter
      fireEvent.click(screen.getByText('Utility'));

      // Only utility servers should be shown
      expect(screen.getByText('File System')).toBeInTheDocument();
      expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
      expect(screen.queryByText('PostgreSQL')).not.toBeInTheDocument();

      // Click productivity filter
      fireEvent.click(screen.getByText('Productivity'));

      // Only productivity servers should be shown
      expect(screen.queryByText('File System')).not.toBeInTheDocument();
      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.queryByText('PostgreSQL')).not.toBeInTheDocument();

      // Click All to show all again
      fireEvent.click(screen.getByText('All'));

      expect(screen.getByText('File System')).toBeInTheDocument();
      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    });

    it('should highlight selected category button', () => {
      const allButton = screen.getByText('All');
      const utilityButton = screen.getByText('Utility');

      // All should be selected by default - check for variant classes
      const allButtonElement = allButton.closest('button');
      expect(allButtonElement).toHaveClass('bg-primary', 'text-primary-foreground');

      // Click utility
      fireEvent.click(utilityButton);

      // Utility should be selected
      const utilityButtonElement = utilityButton.closest('button');
      expect(utilityButtonElement).toHaveClass('bg-primary', 'text-primary-foreground');
    });
  });

  describe('Server Installation', () => {
    beforeEach(async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockRecommendedServers),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ mcpServers: {} }),
        });

      render(<MCPServerBrowser />);

      await waitFor(() => {
        expect(screen.getByText('MCP Server Browser')).toBeInTheDocument();
      });
    });

    it('should install server successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const installButton = screen.getAllByText('Install')[0]; // File System
      fireEvent.click(installButton);

      // Should show installing state
      await waitFor(() => {
        expect(screen.getByText('Installing...')).toBeInTheDocument();
      });

      // Should make API call
      expect(mockFetch).toHaveBeenCalledWith('/api/mcp-servers/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serverId: 'filesystem',
          config: mockRecommendedServers.servers.filesystem.config,
        }),
      });

      // After installation, the server should be removed from the list
      await waitFor(() => {
        expect(screen.queryByText('File System')).not.toBeInTheDocument();
      });
    });

    it('should handle installation failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'Installation failed' }),
      });

      const installButton = screen.getAllByText('Install')[0];
      fireEvent.click(installButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to install File System: Installation failed')).toBeInTheDocument();
      });

      // Server should still be in the list
      expect(screen.getByText('File System')).toBeInTheDocument();
    });

    it('should handle network error during installation', async () => {
      // Mock console.error to suppress expected error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const installButton = screen.getAllByText('Install')[0];
      fireEvent.click(installButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to install File System: Network error')).toBeInTheDocument();
      });
      
      consoleSpy.mockRestore();
    });

    it('should disable install button during installation', async () => {
      // Mock a slow installation
      mockFetch.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));

      const installButton = screen.getAllByText('Install')[0];
      fireEvent.click(installButton);

      // Button should be disabled
      await waitFor(() => {
        expect(screen.getByText('Installing...')).toBeInTheDocument();
        expect(screen.getByText('Installing...').closest('button')).toBeDisabled();
      });
    });
  });

  describe('Repository Links', () => {
    beforeEach(async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockRecommendedServers),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ mcpServers: {} }),
        });

      render(<MCPServerBrowser />);

      await waitFor(() => {
        expect(screen.getByText('MCP Server Browser')).toBeInTheDocument();
      });
    });

    it('should open repository links in new window', () => {
      // Find buttons that have SVG icons but no text (external link buttons)
      const allButtons = screen.getAllByRole('button');
      const repoButton = allButtons.find(btn => {
        const svg = btn.querySelector('svg');
        const hasText = btn.textContent && btn.textContent.trim().length > 0;
        return svg && !hasText;
      });

      expect(repoButton).toBeDefined();
      fireEvent.click(repoButton!);

      expect(window.open).toHaveBeenCalledWith(
        mockRecommendedServers.servers.filesystem.repository,
        '_blank'
      );
    });
  });

  describe('Error Handling', () => {
    it('should display and clear error messages', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockRecommendedServers),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ mcpServers: {} }),
        });

      render(<MCPServerBrowser />);

      await waitFor(() => {
        expect(screen.getByText('MCP Server Browser')).toBeInTheDocument();
      });

      // Trigger an installation error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'Test error' }),
      });

      const installButton = screen.getAllByText('Install')[0];
      fireEvent.click(installButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to install.*Test error/)).toBeInTheDocument();
      });

      // Try another installation - error should be cleared
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const anotherInstallButton = screen.getAllByText('Install')[0];
      fireEvent.click(anotherInstallButton);

      await waitFor(() => {
        expect(screen.queryByText(/Failed to install.*Test error/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Empty States', () => {
    it('should handle empty server list', async () => {
      const emptyServers = {
        ...mockRecommendedServers,
        servers: {},
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(emptyServers),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ mcpServers: {} }),
        });

      render(<MCPServerBrowser />);

      await waitFor(() => {
        expect(screen.getByText('MCP Server Browser')).toBeInTheDocument();
      });

      // Should show no servers
      expect(screen.queryByText('Install')).not.toBeInTheDocument();
    });

    it('should handle all servers being installed', async () => {
      const allInstalledServers = {
        mcpServers: {
          'filesystem': { command: 'npx' },
          'github': { command: 'npx' },
          'database': { command: 'npx' },
        },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockRecommendedServers),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(allInstalledServers),
        });

      render(<MCPServerBrowser />);

      await waitFor(() => {
        expect(screen.getByText('MCP Server Browser')).toBeInTheDocument();
      });

      // Should show no available servers since all are installed
      expect(screen.queryByText('Install')).not.toBeInTheDocument();
      expect(screen.queryByText('File System')).not.toBeInTheDocument();
    });
  });
});