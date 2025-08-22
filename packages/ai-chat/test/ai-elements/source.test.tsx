import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { 
  Sources, 
  SourcesTrigger, 
  SourcesContent, 
  Source 
} from '../../src/components/ai-elements/source';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  BookIcon: ({ className }: { className?: string }) => (
    <div data-testid="book-icon" className={className}>📖</div>
  ),
  ChevronDownIcon: ({ className }: { className?: string }) => (
    <div data-testid="chevron-icon" className={className}>▼</div>
  ),
}));

describe('Sources Components', () => {
  describe('Sources Component', () => {
    it('should render as collapsible container', () => {
      render(
        <Sources data-testid="sources">
          <SourcesTrigger count={2} />
          <SourcesContent>Content</SourcesContent>
        </Sources>
      );
      
      const sources = screen.getByTestId('sources');
      expect(sources).toBeInTheDocument();
    });

    it('should apply default classes and custom className', () => {
      render(
        <Sources className="custom-sources" data-testid="sources">
          <SourcesTrigger count={1} />
          <SourcesContent>Content</SourcesContent>
        </Sources>
      );
      
      const sources = screen.getByTestId('sources');
      expect(sources).toHaveClass('custom-sources');
      expect(sources).toHaveClass('not-prose', 'mb-4', 'text-primary', 'text-xs');
    });

    it('should pass through additional props', () => {
      render(
        <Sources 
          data-testid="sources"
          id="test-sources"
          role="region"
        >
          <SourcesTrigger count={1} />
          <SourcesContent>Content</SourcesContent>
        </Sources>
      );
      
      const sources = screen.getByTestId('sources');
      expect(sources).toHaveAttribute('id', 'test-sources');
      expect(sources).toHaveAttribute('role', 'region');
    });
  });

  describe('SourcesTrigger Component', () => {
    it('should render with default content and count', () => {
      render(
        <Sources>
          <SourcesTrigger count={3} data-testid="trigger" />
          <SourcesContent>Content</SourcesContent>
        </Sources>
      );
      
      expect(screen.getByText('Used 3 sources')).toBeInTheDocument();
      expect(screen.getByTestId('chevron-icon')).toBeInTheDocument();
    });

    it('should render with different counts', () => {
      const { rerender } = render(
        <Sources>
          <SourcesTrigger count={1} />
          <SourcesContent>Content</SourcesContent>
        </Sources>
      );
      
      expect(screen.getByText('Used 1 sources')).toBeInTheDocument();
      
      rerender(
        <Sources>
          <SourcesTrigger count={0} />
          <SourcesContent>Content</SourcesContent>
        </Sources>
      );
      
      expect(screen.getByText('Used 0 sources')).toBeInTheDocument();
      
      rerender(
        <Sources>
          <SourcesTrigger count={10} />
          <SourcesContent>Content</SourcesContent>
        </Sources>
      );
      
      expect(screen.getByText('Used 10 sources')).toBeInTheDocument();
    });

    it('should render custom children when provided', () => {
      render(
        <Sources>
          <SourcesTrigger count={2}>
            <span>Custom Trigger Content</span>
          </SourcesTrigger>
          <SourcesContent>Content</SourcesContent>
        </Sources>
      );
      
      expect(screen.getByText('Custom Trigger Content')).toBeInTheDocument();
      expect(screen.queryByText('Used 2 sources')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chevron-icon')).not.toBeInTheDocument();
    });

    it('should have default flex styling', () => {
      render(
        <Sources>
          <SourcesTrigger 
            count={1} 
            data-testid="trigger"
          />
          <SourcesContent>Content</SourcesContent>
        </Sources>
      );
      
      const trigger = screen.getByTestId('trigger');
      expect(trigger).toHaveClass('flex', 'items-center', 'gap-2');
    });

    it('should pass through additional props', () => {
      render(
        <Sources>
          <SourcesTrigger 
            count={2}
            data-testid="trigger"
            id="sources-trigger"
            disabled
          />
          <SourcesContent>Content</SourcesContent>
        </Sources>
      );
      
      const trigger = screen.getByTestId('trigger');
      expect(trigger).toHaveAttribute('id', 'sources-trigger');
      expect(trigger).toBeDisabled();
    });
  });

  describe('SourcesContent Component', () => {
    it('should render content', () => {
      render(
        <Sources defaultOpen={true}>
          <SourcesTrigger count={1} />
          <SourcesContent data-testid="content">
            <div>Sources list content</div>
          </SourcesContent>
        </Sources>
      );
      
      expect(screen.getByTestId('content')).toBeInTheDocument();
      expect(screen.getByText('Sources list content')).toBeInTheDocument();
    });

    it('should apply default classes and custom className', () => {
      render(
        <Sources defaultOpen={true}>
          <SourcesTrigger count={1} />
          <SourcesContent 
            className="custom-content"
            data-testid="content"
          >
            Content
          </SourcesContent>
        </Sources>
      );
      
      const content = screen.getByTestId('content');
      expect(content).toHaveClass('custom-content');
      expect(content).toHaveClass('mt-3', 'flex', 'flex-col', 'gap-2', 'w-fit');
    });

    it('should pass through additional props', () => {
      render(
        <Sources defaultOpen={true}>
          <SourcesTrigger count={1} />
          <SourcesContent 
            data-testid="content"
            id="sources-content"
            role="list"
          >
            Content
          </SourcesContent>
        </Sources>
      );
      
      const content = screen.getByTestId('content');
      expect(content).toHaveAttribute('id', 'sources-content');
      expect(content).toHaveAttribute('role', 'list');
    });
  });

  describe('Source Component', () => {
    it('should render with default content', () => {
      render(<Source href="https://example.com" title="Example Site" />);
      
      expect(screen.getByTestId('book-icon')).toBeInTheDocument();
      expect(screen.getByText('Example Site')).toBeInTheDocument();
      
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://example.com');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
    });

    it('should render with custom children', () => {
      render(
        <Source href="https://example.com" title="Example Site">
          <span>Custom Source Content</span>
        </Source>
      );
      
      expect(screen.getByText('Custom Source Content')).toBeInTheDocument();
      expect(screen.queryByTestId('book-icon')).not.toBeInTheDocument();
      expect(screen.queryByText('Example Site')).not.toBeInTheDocument();
    });

    it('should handle missing title gracefully', () => {
      render(<Source href="https://example.com" data-testid="source" />);
      
      const source = screen.getByTestId('source');
      expect(source).toBeInTheDocument();
      expect(screen.getByTestId('book-icon')).toBeInTheDocument();
    });

    it('should handle missing href', () => {
      render(<Source title="No Link" data-testid="source" />);
      
      const source = screen.getByTestId('source');
      expect(source).toBeInTheDocument();
      expect(source).not.toHaveAttribute('href');
    });

    it('should have default flex styling', () => {
      render(
        <Source 
          href="https://example.com" 
          title="Example"
          data-testid="source"
        />
      );
      
      const source = screen.getByTestId('source');
      expect(source).toHaveClass('flex', 'items-center', 'gap-2');
    });

    it('should pass through additional props', () => {
      render(
        <Source 
          href="https://example.com"
          title="Example"
          data-testid="source"
          id="source-1"
          onClick={() => {}}
        />
      );
      
      const source = screen.getByTestId('source');
      expect(source).toHaveAttribute('id', 'source-1');
      expect(source).toHaveAttribute('href', 'https://example.com');
    });
  });

  describe('Complete Sources Integration', () => {
    it('should render complete sources structure', () => {
      render(
        <Sources data-testid="sources">
          <SourcesTrigger count={2} />
          <SourcesContent>
            <Source href="https://site1.com" title="Site 1" />
            <Source href="https://site2.com" title="Site 2" />
          </SourcesContent>
        </Sources>
      );
      
      expect(screen.getByText('Used 2 sources')).toBeInTheDocument();
      expect(screen.getByTestId('chevron-icon')).toBeInTheDocument();
    });

    it('should work with custom trigger and content', () => {
      render(
        <Sources defaultOpen={true}>
          <SourcesTrigger count={3}>
            <span>View 3 References</span>
          </SourcesTrigger>
          <SourcesContent>
            <Source href="https://example.com">
              <div>Custom source layout</div>
            </Source>
          </SourcesContent>
        </Sources>
      );
      
      expect(screen.getByText('View 3 References')).toBeInTheDocument();
      expect(screen.getByText('Custom source layout')).toBeInTheDocument();
    });

    it('should handle empty sources', () => {
      render(
        <Sources>
          <SourcesTrigger count={0} />
          <SourcesContent>
            <div>No sources available</div>
          </SourcesContent>
        </Sources>
      );
      
      expect(screen.getByText('Used 0 sources')).toBeInTheDocument();
    });

    it('should handle multiple sources with different props', () => {
      render(
        <Sources defaultOpen={true}>
          <SourcesTrigger count={3} />
          <SourcesContent>
            <Source href="https://site1.com" title="First Source" />
            <Source href="https://site2.com" title="Second Source" />
            <Source title="Third Source (No Link)" />
          </SourcesContent>
        </Sources>
      );
      
      expect(screen.getByText('First Source')).toBeInTheDocument();
      expect(screen.getByText('Second Source')).toBeInTheDocument();
      expect(screen.getByText('Third Source (No Link)')).toBeInTheDocument();
      
      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(2); // Only Sources with href render as proper links
      expect(links[0]).toHaveAttribute('href', 'https://site1.com');
      expect(links[1]).toHaveAttribute('href', 'https://site2.com');
      
      // Third element exists as an <a> tag but without href (not a proper link)
      const allATags = screen.getByText('Third Source (No Link)').closest('a');
      expect(allATags).toBeInTheDocument();
      expect(allATags).not.toHaveAttribute('href');
    });
  });
});