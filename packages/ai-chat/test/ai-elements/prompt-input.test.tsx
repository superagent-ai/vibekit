import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputButton,
} from '../../src/components/ai-elements/prompt-input';

describe('PromptInput components', () => {
  describe('PromptInput', () => {
    it('should render as form element', () => {
      render(<PromptInput data-testid="prompt-form" />);
      
      const form = screen.getByTestId('prompt-form');
      expect(form.tagName).toBe('FORM');
    });
  });

  describe('PromptInputTextarea', () => {
    it('should render with default placeholder', () => {
      render(<PromptInputTextarea />);
      
      const textarea = screen.getByPlaceholderText('What would you like to know?');
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveAttribute('name', 'message');
    });

    it('should submit form on Enter key press', () => {
      // Mock requestSubmit since jsdom doesn't support it
      const mockRequestSubmit = vi.fn();
      HTMLFormElement.prototype.requestSubmit = mockRequestSubmit;
      
      const MockForm = () => (
        <form>
          <PromptInputTextarea />
        </form>
      );
      
      render(<MockForm />);
      
      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'Enter' });
      
      expect(mockRequestSubmit).toHaveBeenCalled();
    });

    it('should not submit on Shift+Enter', () => {
      const mockSubmit = vi.fn();
      const MockForm = () => (
        <form onSubmit={mockSubmit}>
          <PromptInputTextarea />
        </form>
      );
      
      render(<MockForm />);
      
      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
      
      expect(mockSubmit).not.toHaveBeenCalled();
    });
  });

  describe('PromptInputSubmit', () => {
    it('should render send icon by default', () => {
      render(<PromptInputSubmit data-testid="submit-btn" />);
      
      const button = screen.getByTestId('submit-btn');
      expect(button).toHaveAttribute('type', 'submit');
      
      const icon = button.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should show loading spinner when submitted', () => {
      render(<PromptInputSubmit status="submitted" data-testid="submit-btn" />);
      
      const button = screen.getByTestId('submit-btn');
      const spinner = button.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should show stop icon when streaming', () => {
      render(<PromptInputSubmit status="streaming" data-testid="submit-btn" />);
      
      const button = screen.getByTestId('submit-btn');
      const icon = button.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should show error icon when status is error', () => {
      render(<PromptInputSubmit status="error" data-testid="submit-btn" />);
      
      const button = screen.getByTestId('submit-btn');
      const icon = button.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('PromptInputButton', () => {
    it('should render with default ghost variant', () => {
      render(<PromptInputButton>Button</PromptInputButton>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveTextContent('Button');
    });

    it('should handle click events', () => {
      const handleClick = vi.fn();
      render(<PromptInputButton onClick={handleClick}>Click me</PromptInputButton>);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});