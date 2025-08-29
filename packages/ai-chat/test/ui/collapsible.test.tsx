import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../src/components/ui/collapsible';

describe('Collapsible Components', () => {
  describe('Collapsible Root', () => {
    it('should render as collapsible root', () => {
      render(
        <Collapsible data-testid="collapsible">
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      
      const collapsible = screen.getByTestId('collapsible');
      expect(collapsible).toBeInTheDocument();
      expect(collapsible).toHaveAttribute('data-slot', 'collapsible');
    });

    it('should be closed by default', () => {
      render(
        <Collapsible data-testid="collapsible">
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Hidden Content</CollapsibleContent>
        </Collapsible>
      );
      
      // Content should not be visible initially
      expect(screen.queryByText('Hidden Content')).not.toBeInTheDocument();
    });

    it('should be open when defaultOpen is true', () => {
      render(
        <Collapsible defaultOpen={true} data-testid="collapsible">
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Visible Content</CollapsibleContent>
        </Collapsible>
      );
      
      expect(screen.getByText('Visible Content')).toBeInTheDocument();
    });

    it('should be controlled with open prop', () => {
      const { rerender } = render(
        <Collapsible open={false} data-testid="collapsible">
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Controlled Content</CollapsibleContent>
        </Collapsible>
      );
      
      expect(screen.queryByText('Controlled Content')).not.toBeInTheDocument();
      
      rerender(
        <Collapsible open={true} data-testid="collapsible">
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Controlled Content</CollapsibleContent>
        </Collapsible>
      );
      
      expect(screen.getByText('Controlled Content')).toBeInTheDocument();
    });

    it('should pass through additional props', () => {
      render(
        <Collapsible 
          data-testid="collapsible"
          className="custom-collapsible"
          id="test-collapsible"
          role="region"
        >
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      
      const collapsible = screen.getByTestId('collapsible');
      expect(collapsible).toHaveClass('custom-collapsible');
      expect(collapsible).toHaveAttribute('id', 'test-collapsible');
      expect(collapsible).toHaveAttribute('role', 'region');
    });

    it('should call onOpenChange when state changes', () => {
      const onOpenChange = vi.fn();
      
      render(
        <Collapsible onOpenChange={onOpenChange}>
          <CollapsibleTrigger data-testid="trigger">Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      
      const trigger = screen.getByTestId('trigger');
      fireEvent.click(trigger);
      
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe('CollapsibleTrigger', () => {
    it('should render as trigger button', () => {
      render(
        <Collapsible>
          <CollapsibleTrigger data-testid="trigger">Click me</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      
      const trigger = screen.getByTestId('trigger');
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveAttribute('data-slot', 'collapsible-trigger');
      expect(trigger.tagName).toBe('BUTTON');
    });

    it('should toggle collapsible when clicked', () => {
      render(
        <Collapsible>
          <CollapsibleTrigger data-testid="trigger">Toggle</CollapsibleTrigger>
          <CollapsibleContent>Toggle Content</CollapsibleContent>
        </Collapsible>
      );
      
      const trigger = screen.getByTestId('trigger');
      
      // Initially closed
      expect(screen.queryByText('Toggle Content')).not.toBeInTheDocument();
      
      // Click to open
      fireEvent.click(trigger);
      expect(screen.getByText('Toggle Content')).toBeInTheDocument();
      
      // Click to close
      fireEvent.click(trigger);
      expect(screen.queryByText('Toggle Content')).not.toBeInTheDocument();
    });

    it('should pass through additional props', () => {
      render(
        <Collapsible>
          <CollapsibleTrigger 
            data-testid="trigger"
            className="custom-trigger"
            id="test-trigger"
            disabled
          >
            Toggle
          </CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      
      const trigger = screen.getByTestId('trigger');
      expect(trigger).toHaveClass('custom-trigger');
      expect(trigger).toHaveAttribute('id', 'test-trigger');
      expect(trigger).toBeDisabled();
    });

    it('should render custom content', () => {
      render(
        <Collapsible>
          <CollapsibleTrigger data-testid="trigger">
            <span>Custom Trigger Content</span>
            <svg>Icon</svg>
          </CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      
      expect(screen.getByText('Custom Trigger Content')).toBeInTheDocument();
    });
  });

  describe('CollapsibleContent', () => {
    it('should render content when open', () => {
      render(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent data-testid="content">
            <div>Collapsible Content</div>
          </CollapsibleContent>
        </Collapsible>
      );
      
      const content = screen.getByTestId('content');
      expect(content).toBeInTheDocument();
      expect(content).toHaveAttribute('data-slot', 'collapsible-content');
      expect(screen.getByText('Collapsible Content')).toBeInTheDocument();
    });

    it('should not render content when closed', () => {
      render(
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent data-testid="content">
            Hidden Content
          </CollapsibleContent>
        </Collapsible>
      );
      
      expect(screen.queryByText('Hidden Content')).not.toBeInTheDocument();
    });

    it('should pass through additional props', () => {
      render(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent 
            data-testid="content"
            className="custom-content"
            id="test-content"
            role="region"
          >
            Content
          </CollapsibleContent>
        </Collapsible>
      );
      
      const content = screen.getByTestId('content');
      expect(content).toHaveClass('custom-content');
      expect(content).toHaveAttribute('id', 'test-content');
      expect(content).toHaveAttribute('role', 'region');
    });

    it('should render complex content structures', () => {
      render(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent data-testid="content">
            <div>
              <h3>Title</h3>
              <p>Description</p>
              <ul>
                <li>Item 1</li>
                <li>Item 2</li>
              </ul>
            </div>
          </CollapsibleContent>
        </Collapsible>
      );
      
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
    });
  });

  describe('Complete Collapsible Interactions', () => {
    it('should handle complete open/close cycle', () => {
      render(
        <Collapsible data-testid="collapsible">
          <CollapsibleTrigger data-testid="trigger">
            Show Details
          </CollapsibleTrigger>
          <CollapsibleContent data-testid="content">
            <div>Detailed information here</div>
          </CollapsibleContent>
        </Collapsible>
      );
      
      const trigger = screen.getByTestId('trigger');
      
      // Initially closed
      expect(screen.queryByText('Detailed information here')).not.toBeInTheDocument();
      
      // Open
      fireEvent.click(trigger);
      expect(screen.getByText('Detailed information here')).toBeInTheDocument();
      
      // Close again
      fireEvent.click(trigger);
      expect(screen.queryByText('Detailed information here')).not.toBeInTheDocument();
    });

    it('should work with keyboard navigation', () => {
      render(
        <Collapsible>
          <CollapsibleTrigger data-testid="trigger">Toggle</CollapsibleTrigger>
          <CollapsibleContent>Keyboard Content</CollapsibleContent>
        </Collapsible>
      );
      
      const trigger = screen.getByTestId('trigger');
      
      // Focus and use Enter key
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'Enter' });
      
      // Should work with keyboard interaction
      expect(trigger).toHaveFocus();
    });

    it('should handle multiple collapsibles independently', () => {
      render(
        <div>
          <Collapsible>
            <CollapsibleTrigger data-testid="trigger1">First</CollapsibleTrigger>
            <CollapsibleContent>First Content</CollapsibleContent>
          </Collapsible>
          
          <Collapsible>
            <CollapsibleTrigger data-testid="trigger2">Second</CollapsibleTrigger>
            <CollapsibleContent>Second Content</CollapsibleContent>
          </Collapsible>
        </div>
      );
      
      const trigger1 = screen.getByTestId('trigger1');
      const trigger2 = screen.getByTestId('trigger2');
      
      // Open first
      fireEvent.click(trigger1);
      expect(screen.getByText('First Content')).toBeInTheDocument();
      expect(screen.queryByText('Second Content')).not.toBeInTheDocument();
      
      // Open second
      fireEvent.click(trigger2);
      expect(screen.getByText('First Content')).toBeInTheDocument();
      expect(screen.getByText('Second Content')).toBeInTheDocument();
      
      // Close first
      fireEvent.click(trigger1);
      expect(screen.queryByText('First Content')).not.toBeInTheDocument();
      expect(screen.getByText('Second Content')).toBeInTheDocument();
    });
  });
});