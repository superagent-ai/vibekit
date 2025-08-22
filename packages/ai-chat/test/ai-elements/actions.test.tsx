import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Actions, Action } from '../../src/components/ai-elements/actions';

describe('Actions components', () => {
  describe('Actions', () => {
    it('should render children with flex layout', () => {
      render(
        <Actions data-testid="actions">
          <button>Action 1</button>
          <button>Action 2</button>
        </Actions>
      );
      
      expect(screen.getByText('Action 1')).toBeInTheDocument();
      expect(screen.getByText('Action 2')).toBeInTheDocument();
      
      const actions = screen.getByTestId('actions');
      expect(actions).toHaveClass('flex', 'items-center', 'gap-1');
    });
  });

  describe('Action', () => {
    it('should render button with default props', () => {
      render(<Action>Click me</Action>);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Click me');
      expect(button).toHaveAttribute('type', 'button');
    });

    it('should handle click events', () => {
      const handleClick = vi.fn();
      render(<Action onClick={handleClick}>Click me</Action>);
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should render with tooltip when provided', () => {
      render(<Action tooltip="This is a tooltip">Action</Action>);
      
      // Tooltip content should be in the document (though may not be visible)
      expect(screen.getByText('This is a tooltip')).toBeInTheDocument();
    });

    it('should render with accessibility label', () => {
      render(<Action label="Delete item">🗑️</Action>);
      
      const button = screen.getByRole('button');
      expect(screen.getByText('Delete item')).toBeInTheDocument();
      
      // Screen reader text should be present
      const srText = button.querySelector('.sr-only');
      expect(srText).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(<Action className="custom-class">Action</Action>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });

    it('should support disabled state', () => {
      render(<Action disabled>Disabled</Action>);
      
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });
});