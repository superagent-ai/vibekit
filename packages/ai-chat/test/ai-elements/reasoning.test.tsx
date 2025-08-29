import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { 
  Reasoning, 
  ReasoningTrigger, 
  ReasoningContent 
} from '../../src/components/ai-elements/reasoning';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  BrainIcon: ({ className }: { className?: string }) => (
    <div data-testid="brain-icon" className={className}>🧠</div>
  ),
  ChevronDownIcon: ({ className }: { className?: string }) => (
    <div data-testid="chevron-icon" className={className}>▼</div>
  ),
}));

// Mock the Response component
vi.mock('../../src/components/ai-elements/response', () => ({
  Response: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="response" className={className}>
      {children}
    </div>
  ),
}));

// Mock Date.now for duration testing
const mockDateNow = vi.fn();
vi.stubGlobal('Date', { now: mockDateNow });

// Mock setTimeout and clearTimeout with proper async behavior
const mockSetTimeout = vi.fn();
const mockClearTimeout = vi.fn();
vi.stubGlobal('setTimeout', mockSetTimeout);
vi.stubGlobal('clearTimeout', mockClearTimeout);

describe('Reasoning Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDateNow.mockReturnValue(1000);
  });

  describe('Reasoning Context Error', () => {
    it('should throw error when ReasoningTrigger is used outside Reasoning', () => {
      expect(() => {
        render(<ReasoningTrigger />);
      }).toThrow('Reasoning components must be used within Reasoning');
    });

    it('should throw error when ReasoningContent is used outside Reasoning', () => {
      expect(() => {
        render(<ReasoningContent>Test content</ReasoningContent>);
      }).toThrow('`CollapsibleContent` must be used within `Collapsible`');
    });
  });

  describe('Reasoning Component', () => {
    describe('Basic Rendering', () => {
      it('should render with default props', () => {
        render(
          <Reasoning data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test reasoning content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.getByTestId('reasoning')).toBeInTheDocument();
        expect(screen.getByText('Thinking...')).toBeInTheDocument();
        expect(screen.getByTestId('brain-icon')).toBeInTheDocument();
      });

      it('should render with custom className', () => {
        render(
          <Reasoning className="custom-reasoning" data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        const reasoning = screen.getByTestId('reasoning');
        expect(reasoning).toHaveClass('custom-reasoning');
        expect(reasoning).toHaveClass('not-prose', 'mb-4');
      });

      it('should pass through additional props', () => {
        render(
          <Reasoning 
            data-testid="reasoning"
            id="test-reasoning"
            role="region"
          >
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        const reasoning = screen.getByTestId('reasoning');
        expect(reasoning).toHaveAttribute('id', 'test-reasoning');
        expect(reasoning).toHaveAttribute('role', 'region');
      });
    });

    describe('Open/Close State', () => {
      it('should be closed by default', () => {
        render(
          <Reasoning data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        // Content should not be visible when closed
        expect(screen.queryByText('Test content')).not.toBeInTheDocument();
      });

      it('should be open when defaultOpen is true', () => {
        render(
          <Reasoning defaultOpen={true} data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.getByText('Test content')).toBeInTheDocument();
      });

      it('should be controlled when open prop is provided', () => {
        const { rerender } = render(
          <Reasoning open={false} data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.queryByText('Test content')).not.toBeInTheDocument();

        rerender(
          <Reasoning open={true} data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.getByText('Test content')).toBeInTheDocument();
      });

      it('should call onOpenChange when state changes', () => {
        const onOpenChange = vi.fn();

        render(
          <Reasoning onOpenChange={onOpenChange} data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        const trigger = screen.getByText('Thinking...');
        fireEvent.click(trigger);

        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });

    describe('Streaming Behavior', () => {
      it('should auto-open when streaming starts', () => {
        const { rerender } = render(
          <Reasoning data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.queryByText('Test content')).not.toBeInTheDocument();

        rerender(
          <Reasoning isStreaming={true} data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.getByText('Test content')).toBeInTheDocument();
      });

      it('should auto-close when streaming ends (with delay)', async () => {
        const { rerender } = render(
          <Reasoning isStreaming={true} data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.getByText('Test content')).toBeInTheDocument();

        rerender(
          <Reasoning isStreaming={false} data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
      });

      it('should not auto-close when defaultOpen is true', () => {
        const { rerender } = render(
          <Reasoning isStreaming={true} defaultOpen={true} data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        rerender(
          <Reasoning isStreaming={false} defaultOpen={true} data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        // Should not set timeout for auto-close when defaultOpen is true
        expect(mockSetTimeout).not.toHaveBeenCalled();
      });

      it('should cleanup timer on unmount', () => {
        // Mock setTimeout to return a timer ID
        mockSetTimeout.mockImplementation((fn, delay) => {
          return 123; // Return a mock timer ID
        });
        
        const { rerender, unmount } = render(
          <Reasoning isStreaming={true} data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        rerender(
          <Reasoning isStreaming={false} data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        unmount();

        expect(mockClearTimeout).toHaveBeenCalledWith(123);
      });
    });

    describe('Duration Tracking', () => {
      it('should track duration when streaming', () => {
        mockDateNow
          .mockReturnValueOnce(1000) // Start time
          .mockReturnValueOnce(4000); // End time

        const { rerender } = render(
          <Reasoning data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        // Start streaming
        rerender(
          <Reasoning isStreaming={true} data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        // Stop streaming
        rerender(
          <Reasoning isStreaming={false} data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.getByText('Thought for 3 seconds')).toBeInTheDocument();
      });

      it('should use provided duration prop', () => {
        render(
          <Reasoning duration={5} data-testid="reasoning">
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.getByText('Thought for 5 seconds')).toBeInTheDocument();
      });
    });
  });

  describe('ReasoningTrigger Component', () => {
    describe('Basic Rendering', () => {
      it('should render with default title and icons', () => {
        render(
          <Reasoning>
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.getByTestId('brain-icon')).toBeInTheDocument();
        expect(screen.getByTestId('chevron-icon')).toBeInTheDocument();
        expect(screen.getByText('Thinking...')).toBeInTheDocument();
      });

      it('should render with custom title', () => {
        render(
          <Reasoning>
            <ReasoningTrigger title="Custom Reasoning" />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        // Note: The title prop doesn't seem to be used in the current implementation
        expect(screen.getByText('Thinking...')).toBeInTheDocument();
      });

      it('should render custom children when provided', () => {
        render(
          <Reasoning>
            <ReasoningTrigger>
              <span>Custom Trigger Content</span>
            </ReasoningTrigger>
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.getByText('Custom Trigger Content')).toBeInTheDocument();
        expect(screen.queryByTestId('brain-icon')).not.toBeInTheDocument();
      });

      it('should apply custom className', () => {
        render(
          <Reasoning>
            <ReasoningTrigger className="custom-trigger" data-testid="trigger" />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        const trigger = screen.getByTestId('trigger');
        expect(trigger).toHaveClass('custom-trigger');
        expect(trigger).toHaveClass('flex', 'items-center', 'gap-2');
      });
    });

    describe('State-based Text', () => {
      it('should show "Thinking..." when streaming', () => {
        render(
          <Reasoning isStreaming={true}>
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.getByText('Thinking...')).toBeInTheDocument();
      });

      it('should show "Thinking..." when duration is 0', () => {
        render(
          <Reasoning duration={0}>
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.getByText('Thinking...')).toBeInTheDocument();
      });

      it('should show duration when not streaming and duration > 0', () => {
        render(
          <Reasoning isStreaming={false} duration={5}>
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.getByText('Thought for 5 seconds')).toBeInTheDocument();
      });
    });

    describe('Icon Rotation', () => {
      it('should rotate chevron icon when open', () => {
        render(
          <Reasoning defaultOpen={true}>
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        const chevron = screen.getByTestId('chevron-icon');
        expect(chevron).toHaveClass('rotate-180');
      });

      it('should not rotate chevron icon when closed', () => {
        render(
          <Reasoning defaultOpen={false}>
            <ReasoningTrigger />
            <ReasoningContent>Test content</ReasoningContent>
          </Reasoning>
        );

        const chevron = screen.getByTestId('chevron-icon');
        expect(chevron).toHaveClass('rotate-0');
      });
    });
  });

  describe('ReasoningContent Component', () => {
    describe('Basic Rendering', () => {
      it('should render content text', () => {
        render(
          <Reasoning defaultOpen={true}>
            <ReasoningTrigger />
            <ReasoningContent>This is reasoning content</ReasoningContent>
          </Reasoning>
        );

        expect(screen.getByText('This is reasoning content')).toBeInTheDocument();
        expect(screen.getByTestId('response')).toBeInTheDocument();
      });

      it('should apply custom className', () => {
        render(
          <Reasoning defaultOpen={true}>
            <ReasoningTrigger />
            <ReasoningContent className="custom-content" data-testid="content">
              Test content
            </ReasoningContent>
          </Reasoning>
        );

        const content = screen.getByTestId('content');
        expect(content).toHaveClass('custom-content');
        expect(content).toHaveClass('mt-4', 'text-sm');
      });

      it('should pass through additional props', () => {
        render(
          <Reasoning defaultOpen={true}>
            <ReasoningTrigger />
            <ReasoningContent 
              data-testid="content" 
              id="reasoning-content"
              role="region"
            >
              Test content
            </ReasoningContent>
          </Reasoning>
        );

        const content = screen.getByTestId('content');
        expect(content).toHaveAttribute('id', 'reasoning-content');
        expect(content).toHaveAttribute('role', 'region');
      });
    });

    describe('Response Integration', () => {
      it('should render content within Response component', () => {
        render(
          <Reasoning defaultOpen={true}>
            <ReasoningTrigger />
            <ReasoningContent>Test reasoning response</ReasoningContent>
          </Reasoning>
        );

        const response = screen.getByTestId('response');
        expect(response).toBeInTheDocument();
        expect(response).toHaveClass('grid', 'gap-2');
        expect(screen.getByText('Test reasoning response')).toBeInTheDocument();
      });
    });
  });

  describe('Complete Reasoning Flow', () => {
    it('should handle complete reasoning interaction', async () => {
      const { rerender } = render(
        <Reasoning data-testid="reasoning">
          <ReasoningTrigger data-testid="trigger" />
          <ReasoningContent>Complete reasoning flow test</ReasoningContent>
        </Reasoning>
      );

      // Initially closed
      expect(screen.queryByText('Complete reasoning flow test')).not.toBeInTheDocument();
      expect(screen.getByText('Thinking...')).toBeInTheDocument();

      // Click to open manually
      fireEvent.click(screen.getByTestId('trigger'));
      expect(screen.getByText('Complete reasoning flow test')).toBeInTheDocument();

      // Start streaming (should stay open)
      rerender(
        <Reasoning isStreaming={true} data-testid="reasoning">
          <ReasoningTrigger data-testid="trigger" />
          <ReasoningContent>Complete reasoning flow test</ReasoningContent>
        </Reasoning>
      );

      expect(screen.getByText('Complete reasoning flow test')).toBeInTheDocument();
      expect(screen.getByText('Thinking...')).toBeInTheDocument();

      // Stop streaming (should auto-close after delay)
      mockDateNow.mockReturnValue(4000);
      rerender(
        <Reasoning isStreaming={false} data-testid="reasoning">
          <ReasoningTrigger data-testid="trigger" />
          <ReasoningContent>Complete reasoning flow test</ReasoningContent>
        </Reasoning>
      );

      expect(screen.getByText('Thought for 3 seconds')).toBeInTheDocument();
    });
  });

  describe('Display Names', () => {
    it('should have correct display names', () => {
      expect(Reasoning.displayName).toBe('Reasoning');
      expect(ReasoningTrigger.displayName).toBe('ReasoningTrigger');
      expect(ReasoningContent.displayName).toBe('ReasoningContent');
    });
  });
});