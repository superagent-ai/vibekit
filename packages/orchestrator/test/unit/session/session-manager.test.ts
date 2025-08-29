import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../../src/core/session-manager';
import { CreateSessionOptions, SessionFilters } from '../../../src/types/session';
import * as fs from 'fs/promises';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  const testDir = '.vibekit-test';

  beforeEach(async () => {
    sessionManager = new SessionManager();
    
    // Override basePath for testing by accessing private properties
    (sessionManager as any).stateStore.basePath = testDir;
    (sessionManager as any).eventStore.basePath = `${testDir}/events`;
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe('createSession', () => {
    it('should create a new session with all required properties', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-123',
        epicName: 'Test Epic',
        provider: {
          type: 'taskmaster',
          config: { projectRoot: '/test' }
        },
        parallel: true
      };

      const session = await sessionManager.createSession(options);

      expect(session.id).toMatch(/^sess_\d+_[a-z0-9]{9}$/);
      expect(session.epicId).toBe('epic-123');
      expect(session.epicName).toBe('Test Epic');
      expect(session.status).toBe('active');
      expect(session.startedAt).toBeInstanceOf(Date);
      expect(session.lastActiveAt).toBeInstanceOf(Date);
      expect(session.provider.type).toBe('taskmaster');
      expect(session.checkpoint.id).toMatch(/^chkpt_\d+_[a-z0-9]{9}$/);
      expect(session.worktrees).toEqual([]);
      expect(session.containers).toEqual([]);
      expect(session.volumes.workspace).toContain(session.id);
    });

    it('should generate epic name when not provided', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-456',
        provider: {
          type: 'github-issues',
          config: {}
        }
      };

      const session = await sessionManager.createSession(options);

      expect(session.epicName).toBe('Epic epic-456');
    });

    it('should save session and update index', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-789',
        provider: { type: 'linear', config: {} }
      };

      const session = await sessionManager.createSession(options);
      
      // Verify session can be loaded
      const loadedSession = await sessionManager.loadSession(session.id);
      expect(loadedSession).toEqual(session);

      // Verify session index is updated
      const sessions = await sessionManager.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(session.id);
    });
  });

  describe('loadSession', () => {
    it('should return null for non-existent session', async () => {
      const session = await sessionManager.loadSession('non-existent');
      expect(session).toBeNull();
    });

    it('should load existing session', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-load-test',
        provider: { type: 'taskmaster', config: {} }
      };

      const originalSession = await sessionManager.createSession(options);
      const loadedSession = await sessionManager.loadSession(originalSession.id);

      expect(loadedSession).toEqual(originalSession);
    });
  });

  describe('pauseSession', () => {
    it('should pause active session', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-pause',
        provider: { type: 'taskmaster', config: {} }
      };

      const session = await sessionManager.createSession(options);
      expect(session.status).toBe('active');

      await sessionManager.pauseSession(session.id);
      
      const pausedSession = await sessionManager.loadSession(session.id);
      expect(pausedSession!.status).toBe('paused');
      expect(pausedSession!.pausedAt).toBeInstanceOf(Date);
    });

    it('should not error when pausing already paused session', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-double-pause',
        provider: { type: 'taskmaster', config: {} }
      };

      const session = await sessionManager.createSession(options);
      
      await sessionManager.pauseSession(session.id);
      await sessionManager.pauseSession(session.id); // Should not throw

      const pausedSession = await sessionManager.loadSession(session.id);
      expect(pausedSession!.status).toBe('paused');
    });

    it('should throw error for non-existent session', async () => {
      await expect(sessionManager.pauseSession('non-existent')).rejects.toThrow('Session non-existent not found');
    });
  });

  describe('resumeSession', () => {
    it('should resume paused session', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-resume',
        provider: { type: 'taskmaster', config: {} }
      };

      const session = await sessionManager.createSession(options);
      await sessionManager.pauseSession(session.id);
      
      const resumedSession = await sessionManager.resumeSession(session.id);
      
      expect(resumedSession.status).toBe('active');
      expect(resumedSession.pausedAt).toBeUndefined();
    });

    it('should return session when already active', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-already-active',
        provider: { type: 'taskmaster', config: {} }
      };

      const session = await sessionManager.createSession(options);
      const resumedSession = await sessionManager.resumeSession(session.id);

      expect(resumedSession.id).toBe(session.id);
      expect(resumedSession.status).toBe('active');
    });

    it('should throw error for non-existent session', async () => {
      await expect(sessionManager.resumeSession('non-existent')).rejects.toThrow('Session non-existent not found');
    });
  });

  describe('completeSession', () => {
    it('should complete active session', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-complete',
        provider: { type: 'taskmaster', config: {} }
      };

      const session = await sessionManager.createSession(options);
      await sessionManager.completeSession(session.id);
      
      const completedSession = await sessionManager.loadSession(session.id);
      expect(completedSession!.status).toBe('completed');
      expect(completedSession!.completedAt).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent session', async () => {
      await expect(sessionManager.completeSession('non-existent')).rejects.toThrow('Session non-existent not found');
    });
  });

  describe('failSession', () => {
    it('should fail session with reason', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-fail',
        provider: { type: 'taskmaster', config: {} }
      };

      const session = await sessionManager.createSession(options);
      await sessionManager.failSession(session.id, 'Test failure reason');
      
      const failedSession = await sessionManager.loadSession(session.id);
      expect(failedSession!.status).toBe('failed');
    });
  });

  describe('deleteSession', () => {
    it('should delete existing session', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-delete',
        provider: { type: 'taskmaster', config: {} }
      };

      const session = await sessionManager.createSession(options);
      
      // Verify session exists
      let loadedSession = await sessionManager.loadSession(session.id);
      expect(loadedSession).not.toBeNull();
      
      // Delete session
      await sessionManager.deleteSession(session.id);
      
      // Verify session is gone
      loadedSession = await sessionManager.loadSession(session.id);
      expect(loadedSession).toBeNull();
      
      // Verify removed from index
      const sessions = await sessionManager.listSessions();
      expect(sessions.find(s => s.id === session.id)).toBeUndefined();
    });

    it('should not throw error when deleting non-existent session', async () => {
      await expect(sessionManager.deleteSession('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('listSessions', () => {
    beforeEach(async () => {
      // Create multiple test sessions
      const sessions = [
        { epicId: 'epic-1', provider: { type: 'taskmaster', config: {} } },
        { epicId: 'epic-2', provider: { type: 'linear', config: {} } },
        { epicId: 'epic-3', provider: { type: 'taskmaster', config: {} } }
      ];

      for (const sessionData of sessions) {
        const session = await sessionManager.createSession(sessionData);
        if (sessionData.epicId === 'epic-2') {
          await sessionManager.pauseSession(session.id);
        }
      }
    });

    it('should list all sessions', async () => {
      const sessions = await sessionManager.listSessions();
      expect(sessions).toHaveLength(3);
    });

    it('should filter by status', async () => {
      const filters: SessionFilters = { status: 'active' };
      const activeSessions = await sessionManager.listSessions(filters);
      expect(activeSessions).toHaveLength(2);

      const pausedFilters: SessionFilters = { status: 'paused' };
      const pausedSessions = await sessionManager.listSessions(pausedFilters);
      expect(pausedSessions).toHaveLength(1);
    });

    it('should filter by provider', async () => {
      const filters: SessionFilters = { provider: 'taskmaster' };
      const taskmasterSessions = await sessionManager.listSessions(filters);
      expect(taskmasterSessions).toHaveLength(2);

      const linearFilters: SessionFilters = { provider: 'linear' };
      const linearSessions = await sessionManager.listSessions(filters);
      expect(linearSessions).toHaveLength(1);
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      const filters: SessionFilters = { 
        since: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
        until: tomorrow 
      };
      
      const recentSessions = await sessionManager.listSessions(filters);
      expect(recentSessions).toHaveLength(3); // All sessions should be recent
    });
  });

  describe('checkpoint management', () => {
    it('should create checkpoint', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-checkpoint',
        provider: { type: 'taskmaster', config: {} }
      };

      const session = await sessionManager.createSession(options);
      
      // Add some tasks to the session for testing
      session.checkpoint.pendingTasks = ['task-1', 'task-2', 'task-3'];
      session.checkpoint.completedTasks = ['task-0'];
      
      const checkpoint = await sessionManager.createCheckpoint(session);
      
      expect(checkpoint.id).toMatch(/^chkpt_\d+_[a-z0-9]{9}$/);
      expect(checkpoint.pendingTasks).toEqual(['task-1', 'task-2', 'task-3']);
      expect(checkpoint.completedTasks).toEqual(['task-0']);
      expect(checkpoint.timestamp).toBeInstanceOf(Date);
      expect(session.lastCheckpointId).toBe(checkpoint.id);
    });

    it('should list checkpoints for session', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-checkpoints',
        provider: { type: 'taskmaster', config: {} }
      };

      const session = await sessionManager.createSession(options);
      
      // Create multiple checkpoints
      await sessionManager.createCheckpoint(session);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay for different timestamps
      await sessionManager.createCheckpoint(session);
      
      const checkpoints = await sessionManager.listCheckpoints(session.id);
      expect(checkpoints).toHaveLength(2);
      
      // Should be sorted by timestamp (newest first)
      expect(checkpoints[0].timestamp.getTime()).toBeGreaterThan(checkpoints[1].timestamp.getTime());
    });

    it('should restore from checkpoint', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-restore',
        provider: { type: 'taskmaster', config: {} }
      };

      const session = await sessionManager.createSession(options);
      
      // Modify session state
      session.checkpoint.pendingTasks = ['original-task'];
      const checkpoint = await sessionManager.createCheckpoint(session);
      
      // Further modify session state
      session.checkpoint.pendingTasks = ['modified-task'];
      await sessionManager.saveSession(session);
      
      // Restore from checkpoint
      const restoredSession = await sessionManager.restoreFromCheckpoint(session.id, checkpoint.id);
      
      expect(restoredSession.checkpoint.pendingTasks).toEqual(['original-task']);
      expect(restoredSession.lastCheckpointId).toBe(checkpoint.id);
    });

    it('should throw error when restoring from non-existent checkpoint', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-invalid-restore',
        provider: { type: 'taskmaster', config: {} }
      };

      const session = await sessionManager.createSession(options);
      
      await expect(
        sessionManager.restoreFromCheckpoint(session.id, 'invalid-checkpoint')
      ).rejects.toThrow('Checkpoint invalid-checkpoint not found');
    });
  });

  describe('session lifecycle integration', () => {
    it('should handle complete session lifecycle', async () => {
      const options: CreateSessionOptions = {
        epicId: 'epic-lifecycle',
        epicName: 'Full Lifecycle Test',
        provider: { type: 'taskmaster', config: {} }
      };

      // Create session
      const session = await sessionManager.createSession(options);
      expect(session.status).toBe('active');

      // Pause session
      await sessionManager.pauseSession(session.id);
      let updatedSession = await sessionManager.loadSession(session.id);
      expect(updatedSession!.status).toBe('paused');

      // Resume session
      await sessionManager.resumeSession(session.id);
      updatedSession = await sessionManager.loadSession(session.id);
      expect(updatedSession!.status).toBe('active');

      // Complete session
      await sessionManager.completeSession(session.id);
      updatedSession = await sessionManager.loadSession(session.id);
      expect(updatedSession!.status).toBe('completed');
      expect(updatedSession!.completedAt).toBeInstanceOf(Date);

      // Verify session index reflects final state
      const sessions = await sessionManager.listSessions();
      const sessionSummary = sessions.find(s => s.id === session.id);
      expect(sessionSummary!.status).toBe('completed');
      expect(sessionSummary!.completedAt).toBeInstanceOf(Date);
    });
  });
});