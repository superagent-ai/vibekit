import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from '../../src/components/ui/alert';

describe('Alert Components', () => {
  describe('Alert', () => {
    it('should render with default variant', () => {
      render(<Alert data-testid="alert">Default alert</Alert>);
      
      const alert = screen.getByTestId('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute('role', 'alert');
      expect(alert.textContent).toBe('Default alert');
    });

    it('should render with destructive variant', () => {
      render(<Alert variant="destructive" data-testid="alert">Destructive alert</Alert>);
      
      const alert = screen.getByTestId('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute('role', 'alert');
    });

    it('should accept custom className', () => {
      render(<Alert className="custom-class" data-testid="alert">Custom alert</Alert>);
      
      const alert = screen.getByTestId('alert');
      expect(alert).toHaveClass('custom-class');
    });

    it('should forward ref correctly', () => {
      let alertRef: HTMLDivElement | null = null;
      
      render(
        <Alert 
          ref={(el) => { alertRef = el; }} 
          data-testid="alert"
        >
          Ref alert
        </Alert>
      );
      
      expect(alertRef).not.toBeNull();
      expect(alertRef?.tagName).toBe('DIV');
    });

    it('should pass through additional props', () => {
      render(
        <Alert 
          data-testid="alert" 
          id="test-alert"
          aria-label="Test alert"
        >
          Props alert
        </Alert>
      );
      
      const alert = screen.getByTestId('alert');
      expect(alert).toHaveAttribute('id', 'test-alert');
      expect(alert).toHaveAttribute('aria-label', 'Test alert');
    });
  });

  describe('AlertTitle', () => {
    it('should render as h5 element', () => {
      render(<AlertTitle data-testid="alert-title">Alert Title</AlertTitle>);
      
      const title = screen.getByTestId('alert-title');
      expect(title).toBeInTheDocument();
      expect(title.tagName).toBe('H5');
      expect(title.textContent).toBe('Alert Title');
    });

    it('should accept custom className', () => {
      render(<AlertTitle className="custom-title" data-testid="alert-title">Title</AlertTitle>);
      
      const title = screen.getByTestId('alert-title');
      expect(title).toHaveClass('custom-title');
      expect(title).toHaveClass('mb-1', 'font-medium', 'leading-none', 'tracking-tight');
    });

    it('should forward ref correctly', () => {
      let titleRef: HTMLParagraphElement | null = null;
      
      render(
        <AlertTitle 
          ref={(el) => { titleRef = el; }} 
          data-testid="alert-title"
        >
          Ref title
        </AlertTitle>
      );
      
      expect(titleRef).not.toBeNull();
      expect(titleRef?.tagName).toBe('H5');
    });

    it('should pass through additional props', () => {
      render(
        <AlertTitle 
          data-testid="alert-title"
          id="test-title"
          aria-level="1"
        >
          Props title
        </AlertTitle>
      );
      
      const title = screen.getByTestId('alert-title');
      expect(title).toHaveAttribute('id', 'test-title');
      expect(title).toHaveAttribute('aria-level', '1');
    });
  });

  describe('AlertDescription', () => {
    it('should render as div element', () => {
      render(<AlertDescription data-testid="alert-desc">Alert Description</AlertDescription>);
      
      const description = screen.getByTestId('alert-desc');
      expect(description).toBeInTheDocument();
      expect(description.tagName).toBe('DIV');
      expect(description.textContent).toBe('Alert Description');
    });

    it('should accept custom className', () => {
      render(<AlertDescription className="custom-desc" data-testid="alert-desc">Description</AlertDescription>);
      
      const description = screen.getByTestId('alert-desc');
      expect(description).toHaveClass('custom-desc');
      expect(description).toHaveClass('text-sm');
    });

    it('should forward ref correctly', () => {
      let descRef: HTMLParagraphElement | null = null;
      
      render(
        <AlertDescription 
          ref={(el) => { descRef = el; }} 
          data-testid="alert-desc"
        >
          Ref description
        </AlertDescription>
      );
      
      expect(descRef).not.toBeNull();
      expect(descRef?.tagName).toBe('DIV');
    });

    it('should pass through additional props', () => {
      render(
        <AlertDescription 
          data-testid="alert-desc"
          id="test-desc"
          role="region"
        >
          Props description
        </AlertDescription>
      );
      
      const description = screen.getByTestId('alert-desc');
      expect(description).toHaveAttribute('id', 'test-desc');
      expect(description).toHaveAttribute('role', 'region');
    });
  });

  describe('Complete Alert Usage', () => {
    it('should render complete alert with title and description', () => {
      render(
        <Alert data-testid="complete-alert">
          <AlertTitle data-testid="complete-title">Error</AlertTitle>
          <AlertDescription data-testid="complete-desc">
            Something went wrong. Please try again.
          </AlertDescription>
        </Alert>
      );
      
      const alert = screen.getByTestId('complete-alert');
      const title = screen.getByTestId('complete-title');
      const description = screen.getByTestId('complete-desc');
      
      expect(alert).toBeInTheDocument();
      expect(title).toBeInTheDocument();
      expect(description).toBeInTheDocument();
      
      expect(title.textContent).toBe('Error');
      expect(description.textContent).toBe('Something went wrong. Please try again.');
    });

    it('should render destructive alert with all components', () => {
      render(
        <Alert variant="destructive" data-testid="destructive-alert">
          <AlertTitle data-testid="destructive-title">Critical Error</AlertTitle>
          <AlertDescription data-testid="destructive-desc">
            This is a critical error that requires immediate attention.
          </AlertDescription>
        </Alert>
      );
      
      const alert = screen.getByTestId('destructive-alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute('role', 'alert');
    });
  });
});