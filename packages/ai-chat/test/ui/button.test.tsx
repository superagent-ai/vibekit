import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../../src/components/ui/button';

describe('Button Component', () => {
  describe('Default Button Behavior', () => {
    it('should render as button element by default', () => {
      render(<Button data-testid="button">Click me</Button>);
      
      const button = screen.getByTestId('button');
      expect(button).toBeInTheDocument();
      expect(button.tagName).toBe('BUTTON');
      expect(button).toHaveAttribute('data-slot', 'button');
      expect(button.textContent).toBe('Click me');
    });

    it('should apply default variant and size classes', () => {
      render(<Button data-testid="button">Default</Button>);
      
      const button = screen.getByTestId('button');
      expect(button).toHaveClass('inline-flex', 'items-center', 'justify-center');
    });
  });

  describe('asChild Prop - Branch Coverage', () => {
    it('should render as button when asChild is false', () => {
      render(
        <Button asChild={false} data-testid="button">
          Regular Button
        </Button>
      );
      
      const button = screen.getByTestId('button');
      expect(button).toBeInTheDocument();
      expect(button.tagName).toBe('BUTTON');
      expect(button).toHaveAttribute('data-slot', 'button');
    });

    it('should render as Slot component when asChild is true', () => {
      render(
        <Button asChild data-testid="slot-button">
          <a href="#test">Link Button</a>
        </Button>
      );
      
      // When asChild is true, the Slot component renders the child element
      const link = screen.getByTestId('slot-button');
      expect(link).toBeInTheDocument();
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '#test');
      expect(link).toHaveAttribute('data-slot', 'button');
      expect(link.textContent).toBe('Link Button');
    });

    it('should apply button classes to child element when asChild is true', () => {
      render(
        <Button asChild variant="destructive" size="lg" data-testid="slot-button">
          <a href="#test">Destructive Link</a>
        </Button>
      );
      
      const link = screen.getByTestId('slot-button');
      expect(link).toHaveClass('inline-flex', 'items-center');
      expect(link).toHaveAttribute('data-slot', 'button');
    });
  });

  describe('Variants', () => {
    it('should render with default variant', () => {
      render(<Button variant="default" data-testid="button">Default</Button>);
      
      const button = screen.getByTestId('button');
      expect(button).toBeInTheDocument();
    });

    it('should render with destructive variant', () => {
      render(<Button variant="destructive" data-testid="button">Destructive</Button>);
      
      const button = screen.getByTestId('button');
      expect(button).toBeInTheDocument();
    });

    it('should render with outline variant', () => {
      render(<Button variant="outline" data-testid="button">Outline</Button>);
      
      const button = screen.getByTestId('button');
      expect(button).toBeInTheDocument();
    });

    it('should render with secondary variant', () => {
      render(<Button variant="secondary" data-testid="button">Secondary</Button>);
      
      const button = screen.getByTestId('button');
      expect(button).toBeInTheDocument();
    });

    it('should render with ghost variant', () => {
      render(<Button variant="ghost" data-testid="button">Ghost</Button>);
      
      const button = screen.getByTestId('button');
      expect(button).toBeInTheDocument();
    });

    it('should render with link variant', () => {
      render(<Button variant="link" data-testid="button">Link</Button>);
      
      const button = screen.getByTestId('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Sizes', () => {
    it('should render with default size', () => {
      render(<Button size="default" data-testid="button">Default</Button>);
      
      const button = screen.getByTestId('button');
      expect(button).toBeInTheDocument();
    });

    it('should render with small size', () => {
      render(<Button size="sm" data-testid="button">Small</Button>);
      
      const button = screen.getByTestId('button');
      expect(button).toBeInTheDocument();
    });

    it('should render with large size', () => {
      render(<Button size="lg" data-testid="button">Large</Button>);
      
      const button = screen.getByTestId('button');
      expect(button).toBeInTheDocument();
    });

    it('should render with icon size', () => {
      render(<Button size="icon" data-testid="button">Icon</Button>);
      
      const button = screen.getByTestId('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Props Handling', () => {
    it('should accept custom className', () => {
      render(<Button className="custom-class" data-testid="button">Custom</Button>);
      
      const button = screen.getByTestId('button');
      expect(button).toHaveClass('custom-class');
    });

    it('should pass through additional props', () => {
      render(
        <Button 
          data-testid="button"
          id="test-button"
          disabled
          onClick={() => {}}
        >
          Props Button
        </Button>
      );
      
      const button = screen.getByTestId('button');
      expect(button).toHaveAttribute('id', 'test-button');
      expect(button).toBeDisabled();
    });

    it('should handle all combinations of variant and size', () => {
      const variants = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const;
      const sizes = ['default', 'sm', 'lg', 'icon'] as const;
      
      variants.forEach(variant => {
        sizes.forEach(size => {
          render(
            <Button 
              variant={variant} 
              size={size} 
              data-testid={`button-${variant}-${size}`}
              key={`${variant}-${size}`}
            >
              {variant} {size}
            </Button>
          );
          
          const button = screen.getByTestId(`button-${variant}-${size}`);
          expect(button).toBeInTheDocument();
        });
      });
    });
  });
});