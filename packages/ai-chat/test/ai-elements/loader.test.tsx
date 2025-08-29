import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Loader } from '../../src/components/ai-elements/loader';

describe('Loader', () => {
  it('should render with default props', () => {
    render(<Loader data-testid="loader" />);
    
    const loader = screen.getByTestId('loader');
    expect(loader).toBeInTheDocument();
    expect(loader).toHaveClass('inline-flex', 'items-center', 'justify-center', 'animate-spin');
    
    // Should contain SVG icon
    const svg = loader.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('height', '16');
  });

  it('should render with custom size', () => {
    render(<Loader size={24} data-testid="loader" />);
    
    const loader = screen.getByTestId('loader');
    const svg = loader.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('should merge custom className', () => {
    render(<Loader className="custom-class" data-testid="loader" />);
    
    const loader = screen.getByTestId('loader');
    expect(loader).toHaveClass('custom-class', 'animate-spin');
  });

  it('should pass through other HTML attributes', () => {
    render(<Loader title="Loading..." data-testid="loader" />);
    
    const loader = screen.getByTestId('loader');
    expect(loader).toHaveAttribute('title', 'Loading...');
  });
});