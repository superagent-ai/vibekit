export class NotificationService {
  private static instance: NotificationService;
  private permission: NotificationPermission = 'default';

  private constructor() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.permission = Notification.permission;
    }
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.log('This browser does not support notifications');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  isEnabled(): boolean {
    if (typeof window === 'undefined') return false;

    // Check if notifications are enabled in localStorage
    const notificationsEnabled = localStorage.getItem('notifications') === 'true';
    return notificationsEnabled && this.permission === 'granted';
  }

  async showNotification(title: string, options?: NotificationOptions): Promise<void> {
    if (!this.isEnabled()) {
      console.log('Notifications are disabled or not permitted');
      return;
    }

    try {
      const notification = new Notification(title, {
        icon: '/codex-clone.png',
        badge: '/codex-clone.png',
        ...options
      });

      // Auto close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  async showTaskCompleteNotification(taskName: string): Promise<void> {
    await this.showNotification('Task Completed', {
      body: `Your task "${taskName}" has been completed successfully.`,
      tag: 'task-complete',
      requireInteraction: false,
      silent: false
    });
  }

  async showTaskErrorNotification(taskName: string, error: string): Promise<void> {
    await this.showNotification('Task Failed', {
      body: `Your task "${taskName}" encountered an error: ${error}`,
      tag: 'task-error',
      requireInteraction: true,
      silent: false
    });
  }
}