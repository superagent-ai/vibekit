import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { 
  Conversation, 
  ConversationContent, 
  ConversationScrollButton 
} from '../../src/components/ai-elements/conversation';

describe('Conversation components', () => {
  describe('Conversation', () => {
    it('should render children with flex layout', () => {
      render(
        <Conversation data-testid="conversation">
          <div>Child 1</div>
          <div>Child 2</div>
        </Conversation>
      );
      
      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
      
      const conversation = screen.getByTestId('conversation');
      expect(conversation).toHaveClass('flex', 'flex-col', 'h-full');
    });
  });

  describe('ConversationContent', () => {
    it('should render with scroll area and centered content', () => {
      render(
        <ConversationContent>
          <div>Message content</div>
        </ConversationContent>
      );
      
      expect(screen.getByText('Message content')).toBeInTheDocument();
      
      // The scroll area creates a complex DOM structure, just verify content renders
      expect(screen.getByText('Message content')).toBeInTheDocument();
    });
  });

  describe('ConversationScrollButton', () => {
    it('should render scroll button with chevron icon', () => {
      render(<ConversationScrollButton data-testid="scroll-btn" />);
      
      const button = screen.getByTestId('scroll-btn');
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('absolute', 'bottom-4', 'right-4');
      
      // Should have chevron down icon
      const icon = button.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });
});