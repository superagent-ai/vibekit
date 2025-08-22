import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Message, MessageAvatar, MessageContent } from '../../src/components/ai-elements/message';

describe('Message components', () => {
  describe('Message', () => {
    it('should render with default assistant role', () => {
      render(<Message data-testid="message">Test message</Message>);
      
      expect(screen.getByText('Test message')).toBeInTheDocument();
      const messageContainer = screen.getByTestId('message');
      expect(messageContainer).toHaveClass('flex', 'gap-3', 'rounded-lg');
    });

    it('should render with user role', () => {
      render(<Message role="user" data-testid="message">User message</Message>);
      
      expect(screen.getByText('User message')).toBeInTheDocument();
      const messageContainer = screen.getByTestId('message');
      expect(messageContainer).toHaveAttribute('data-testid', 'message');
    });

    it('should render with system role', () => {
      render(<Message role="system" data-testid="message">System message</Message>);
      
      expect(screen.getByText('System message')).toBeInTheDocument();
      const messageContainer = screen.getByTestId('message');
      expect(messageContainer).toBeInTheDocument();
    });

    it('should accept custom props', () => {
      render(<Message data-testid="message" id="custom-id">Message</Message>);
      
      const messageContainer = screen.getByTestId('message');
      expect(messageContainer).toHaveAttribute('id', 'custom-id');
    });
  });

  describe('MessageAvatar', () => {
    it('should render avatar component', () => {
      render(<MessageAvatar />);
      
      // Avatar component should be rendered
      const avatar = document.querySelector('[class*="h-8 w-8"]');
      expect(avatar).toBeInTheDocument();
    });
  });

  describe('MessageContent', () => {
    it('should render content with children', () => {
      render(
        <MessageContent>
          <div>Content 1</div>
          <div>Content 2</div>
        </MessageContent>
      );
      
      expect(screen.getByText('Content 1')).toBeInTheDocument();
      expect(screen.getByText('Content 2')).toBeInTheDocument();
    });

    it('should apply flex-1 and space-y-2 classes', () => {
      render(<MessageContent data-testid="content">Test</MessageContent>);
      
      const content = screen.getByTestId('content');
      expect(content).toHaveClass('flex-1', 'space-y-2');
    });
  });
});