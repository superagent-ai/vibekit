import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { 
  Tool, 
  ToolHeader, 
  ToolContent, 
  ToolInput, 
  ToolOutput, 
  ToolSection,
  type ToolState
} from '../../src/components/ai-elements/tool';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ChevronDown: ({ className, ...props }: any) => (
    <div data-testid="chevron-down" className={className} {...props}>ChevronDown</div>
  ),
  ChevronRight: ({ className, ...props }: any) => (
    <div data-testid="chevron-right" className={className} {...props}>ChevronRight</div>
  ),
  Loader2: ({ className, ...props }: any) => (
    <div data-testid="loader" className={className} {...props}>Loader2</div>
  ),
  CheckCircle: ({ className, ...props }: any) => (
    <div data-testid="check-circle" className={className} {...props}>CheckCircle</div>
  ),
  AlertCircle: ({ className, ...props }: any) => (
    <div data-testid="alert-circle" className={className} {...props}>AlertCircle</div>
  ),
  Terminal: ({ className, ...props }: any) => (
    <div data-testid="terminal" className={className} {...props}>Terminal</div>
  )
}));

describe('Tool Components', () => {
  describe('Tool Component', () => {
    it('should render with default props', () => {
      render(
        <Tool>
          <div>Tool content</div>
        </Tool>
      );

      expect(screen.getByText('Tool content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <Tool className="custom-class">
          <div>Content</div>
        </Tool>
      );

      const toolElement = container.firstChild as HTMLElement;
      expect(toolElement).toHaveClass('custom-class');
    });

    it('should handle click to toggle state', () => {
      const TestContent = () => {
        const [clicked, setClicked] = React.useState(false);
        return (
          <Tool>
            <div onClick={() => setClicked(true)}>
              {clicked ? 'Clicked' : 'Not clicked'}
            </div>
          </Tool>
        );
      };

      render(<TestContent />);
      
      const clickableArea = screen.getByText('Not clicked');
      fireEvent.click(clickableArea);
      
      expect(screen.getByText('Clicked')).toBeInTheDocument();
    });

    it('should have proper accessibility structure', () => {
      const { container } = render(
        <Tool>
          <div>Accessible content</div>
        </Tool>
      );

      const clickableDiv = container.querySelector('.cursor-pointer') as HTMLElement;
      expect(clickableDiv).toBeInTheDocument();
    });
  });

  describe('ToolHeader Component', () => {
    const defaultProps = {
      type: 'test-tool',
      state: 'pending' as ToolState,
      isOpen: false,
      onToggle: vi.fn()
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should render tool type and state', () => {
      render(<ToolHeader {...defaultProps} />);

      expect(screen.getByText('test-tool')).toBeInTheDocument();
      expect(screen.getByText('Preparing...')).toBeInTheDocument();
    });

    it('should show correct icon for pending state', () => {
      render(<ToolHeader {...defaultProps} state="pending" />);

      expect(screen.getByTestId('loader')).toBeInTheDocument();
      expect(screen.getByText('Preparing...')).toBeInTheDocument();
    });

    it('should show correct icon for input-streaming state', () => {
      render(<ToolHeader {...defaultProps} state="input-streaming" />);

      expect(screen.getByTestId('loader')).toBeInTheDocument();
      expect(screen.getByText('Receiving input...')).toBeInTheDocument();
    });

    it('should show correct icon for input-available state', () => {
      render(<ToolHeader {...defaultProps} state="input-available" />);

      // There are multiple terminals (one in header icon, one in state icon)
      const terminals = screen.getAllByTestId('terminal');
      expect(terminals.length).toBe(2);
      expect(screen.getByText('Ready to execute')).toBeInTheDocument();
    });

    it('should show correct icon for executing state', () => {
      render(<ToolHeader {...defaultProps} state="executing" />);

      const loaders = screen.getAllByTestId('loader');
      expect(loaders).toHaveLength(1);
      expect(screen.getByText('Executing...')).toBeInTheDocument();
    });

    it('should show correct icon for output-available state', () => {
      render(<ToolHeader {...defaultProps} state="output-available" />);

      expect(screen.getByTestId('check-circle')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should show correct icon for output-error state', () => {
      render(<ToolHeader {...defaultProps} state="output-error" />);

      expect(screen.getByTestId('alert-circle')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    it('should show chevron down when open', () => {
      render(<ToolHeader {...defaultProps} isOpen={true} />);

      expect(screen.getByTestId('chevron-down')).toBeInTheDocument();
    });

    it('should show chevron right when closed', () => {
      render(<ToolHeader {...defaultProps} isOpen={false} />);

      expect(screen.getByTestId('chevron-right')).toBeInTheDocument();
    });

    it('should call onToggle when clicked', () => {
      const mockToggle = vi.fn();
      render(<ToolHeader {...defaultProps} onToggle={mockToggle} />);

      fireEvent.click(screen.getByText('test-tool').closest('div')!);
      expect(mockToggle).toHaveBeenCalledOnce();
    });

    it('should have proper accessibility attributes', () => {
      render(<ToolHeader {...defaultProps} />);

      const toggleButton = screen.getByLabelText('Toggle tool details');
      expect(toggleButton).toBeInTheDocument();
    });

    it('should handle unknown state gracefully', () => {
      render(<ToolHeader {...defaultProps} state={'unknown' as ToolState} />);

      // Multiple terminals expected
      const terminals = screen.getAllByTestId('terminal');
      expect(terminals.length).toBe(2);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  describe('ToolContent Component', () => {
    it('should render children when open', () => {
      render(
        <ToolContent isOpen={true}>
          <div>Tool content</div>
        </ToolContent>
      );

      expect(screen.getByText('Tool content')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <ToolContent isOpen={false}>
          <div>Tool content</div>
        </ToolContent>
      );

      expect(screen.queryByText('Tool content')).not.toBeInTheDocument();
    });

    it('should default to open when isOpen not specified', () => {
      render(
        <ToolContent>
          <div>Default open content</div>
        </ToolContent>
      );

      expect(screen.getByText('Default open content')).toBeInTheDocument();
    });

    it('should have correct styling classes', () => {
      const { container } = render(
        <ToolContent isOpen={true}>
          <div>Styled content</div>
        </ToolContent>
      );

      const contentWrapper = container.firstChild as HTMLElement;
      expect(contentWrapper).toHaveClass('px-4', 'pb-4', 'space-y-3', 'border-t', 'bg-background/50');
    });
  });

  describe('ToolInput Component', () => {
    it('should format string input', () => {
      render(<ToolInput input="simple string" />);

      expect(screen.getByText('Input Parameters')).toBeInTheDocument();
      expect(screen.getByText('simple string')).toBeInTheDocument();
    });

    it('should format object input as JSON', () => {
      const input = { key: 'value', number: 42 };
      render(<ToolInput input={input} />);

      expect(screen.getByText('Input Parameters')).toBeInTheDocument();
      expect(screen.getByText(/key.*value/)).toBeInTheDocument();
      expect(screen.getByText(/number.*42/)).toBeInTheDocument();
    });

    it('should format array input as JSON', () => {
      const input = ['item1', 'item2', 42];
      render(<ToolInput input={input} />);

      expect(screen.getByText('Input Parameters')).toBeInTheDocument();
      expect(screen.getByText(/item1/)).toBeInTheDocument();
      expect(screen.getByText(/item2/)).toBeInTheDocument();
      expect(screen.getByText(/42/)).toBeInTheDocument();
    });

    it('should handle non-serializable input gracefully', () => {
      const circularObj: any = {};
      circularObj.self = circularObj;
      
      render(<ToolInput input={circularObj} />);

      expect(screen.getByText('Input Parameters')).toBeInTheDocument();
      expect(screen.getByText('[object Object]')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <ToolInput input="test" className="custom-input-class" />
      );

      const inputWrapper = container.firstChild as HTMLElement;
      expect(inputWrapper).toHaveClass('custom-input-class');
    });

    it('should handle null and undefined inputs', () => {
      render(<ToolInput input={null} />);
      expect(screen.getByText('null')).toBeInTheDocument();

      // Re-render with clean DOM for undefined test
      render(<ToolInput input={undefined} />);
      // undefined becomes empty string in String() conversion
      const { container } = render(<ToolInput input={undefined} />);
      expect(container.querySelector('code')).toBeInTheDocument();
    });

    it('should handle number inputs', () => {
      render(<ToolInput input={123.45} />);
      expect(screen.getByText('123.45')).toBeInTheDocument();
    });

    it('should handle boolean inputs', () => {
      render(<ToolInput input={true} />);
      expect(screen.getByText('true')).toBeInTheDocument();
    });
  });

  describe('ToolOutput Component', () => {
    it('should render output when provided', () => {
      render(<ToolOutput output="success result" />);

      expect(screen.getByText('Output')).toBeInTheDocument();
      expect(screen.getByText('success result')).toBeInTheDocument();
    });

    it('should render error when provided', () => {
      render(<ToolOutput errorText="Something went wrong" />);

      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should prioritize error over output', () => {
      render(
        <ToolOutput 
          output="success result" 
          errorText="Error occurred" 
        />
      );

      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Error occurred')).toBeInTheDocument();
      expect(screen.queryByText('Output')).not.toBeInTheDocument();
      expect(screen.queryByText('success result')).not.toBeInTheDocument();
    });

    it('should return null when no output or error', () => {
      const { container } = render(<ToolOutput />);
      expect(container.firstChild).toBeNull();
    });

    it('should format object output as JSON', () => {
      const output = { status: 'success', data: [1, 2, 3] };
      render(<ToolOutput output={output} />);

      expect(screen.getByText('Output')).toBeInTheDocument();
      expect(screen.getByText(/status.*success/)).toBeInTheDocument();
      expect(screen.getByText(/data.*1.*2.*3/)).toBeInTheDocument();
    });

    it('should handle non-serializable output gracefully', () => {
      const circularObj: any = {};
      circularObj.self = circularObj;
      
      render(<ToolOutput output={circularObj} />);

      expect(screen.getByText('Output')).toBeInTheDocument();
      expect(screen.getByText('[object Object]')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <ToolOutput output="test" className="custom-output-class" />
      );

      const outputWrapper = container.firstChild as HTMLElement;
      expect(outputWrapper).toHaveClass('custom-output-class');
    });

    it('should have correct error styling', () => {
      const { container } = render(<ToolOutput errorText="Test error" />);

      expect(container.querySelector('.text-destructive')).toBeInTheDocument();
      expect(container.querySelector('.bg-destructive\\/10')).toBeInTheDocument();
      expect(container.querySelector('.border-destructive\\/20')).toBeInTheDocument();
    });
  });

  describe('ToolSection Component', () => {
    it('should return null when no tool invocations', () => {
      const { container } = render(<ToolSection toolInvocations={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it('should return null when toolInvocations is undefined', () => {
      const { container } = render(<ToolSection />);
      expect(container.firstChild).toBeNull();
    });

    it('should render single tool invocation', () => {
      const invocations = [
        {
          toolName: 'test-tool',
          args: { param: 'value' },
          result: 'success',
          state: 'result' as const
        }
      ];

      render(<ToolSection toolInvocations={invocations} />);

      expect(screen.getByText('test-tool')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should render multiple tool invocations', () => {
      const invocations = [
        {
          toolName: 'tool-1',
          state: 'call' as const
        },
        {
          toolName: 'tool-2',
          state: 'result' as const
        }
      ];

      render(<ToolSection toolInvocations={invocations} />);

      expect(screen.getByText('tool-1')).toBeInTheDocument();
      expect(screen.getByText('tool-2')).toBeInTheDocument();
      expect(screen.getByText('Executing...')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should map tool states correctly', () => {
      const invocations = [
        { toolName: 'partial', state: 'partial-call' as const },
        { toolName: 'call', state: 'call' as const },
        { toolName: 'result', state: 'result' as const },
        { toolName: 'error', state: 'error' as const },
        { toolName: 'unknown', state: undefined }
      ];

      render(<ToolSection toolInvocations={invocations} />);

      expect(screen.getByText('Receiving input...')).toBeInTheDocument(); // partial-call
      expect(screen.getByText('Executing...')).toBeInTheDocument(); // call
      expect(screen.getByText('Completed')).toBeInTheDocument(); // result
      expect(screen.getByText('Error')).toBeInTheDocument(); // error
      expect(screen.getByText('Preparing...')).toBeInTheDocument(); // unknown/default
    });

    it('should toggle tool details on click', () => {
      const invocations = [
        {
          toolName: 'test-tool',
          args: { input: 'test' },
          result: 'output',
          state: 'result' as const
        }
      ];

      render(<ToolSection toolInvocations={invocations} />);

      // Initially closed - input/output should not be visible
      expect(screen.queryByText('Input Parameters')).not.toBeInTheDocument();
      expect(screen.queryByText('Output')).not.toBeInTheDocument();

      // Click to expand
      fireEvent.click(screen.getByText('test-tool'));

      // Should now show input and output
      expect(screen.getByText('Input Parameters')).toBeInTheDocument();
      expect(screen.getByText('Output')).toBeInTheDocument();
      expect(screen.getByText(/input.*test/)).toBeInTheDocument();
      expect(screen.getByText('output')).toBeInTheDocument();

      // Click to collapse
      fireEvent.click(screen.getByText('test-tool'));

      // Should hide input/output again
      expect(screen.queryByText('Input Parameters')).not.toBeInTheDocument();
      expect(screen.queryByText('Output')).not.toBeInTheDocument();
    });

    it('should handle tools with only args', () => {
      const invocations = [
        {
          toolName: 'input-only-tool',
          args: { param: 'value' },
          state: 'call' as const
        }
      ];

      render(<ToolSection toolInvocations={invocations} />);

      // Expand tool
      fireEvent.click(screen.getByText('input-only-tool'));

      expect(screen.getByText('Input Parameters')).toBeInTheDocument();
      expect(screen.queryByText('Output')).not.toBeInTheDocument();
      expect(screen.queryByText('Error')).not.toBeInTheDocument();
    });

    it('should handle tools with only result', () => {
      const invocations = [
        {
          toolName: 'output-only-tool',
          result: 'result data',
          state: 'result' as const
        }
      ];

      render(<ToolSection toolInvocations={invocations} />);

      // Expand tool
      fireEvent.click(screen.getByText('output-only-tool'));

      expect(screen.queryByText('Input Parameters')).not.toBeInTheDocument();
      expect(screen.getByText('Output')).toBeInTheDocument();
      expect(screen.getByText('result data')).toBeInTheDocument();
    });

    it('should handle tools with only error', () => {
      const invocations = [
        {
          toolName: 'error-tool',
          error: 'Tool failed',
          state: 'error' as const
        }
      ];

      render(<ToolSection toolInvocations={invocations} />);

      // Expand tool
      fireEvent.click(screen.getByText('error-tool'));

      expect(screen.queryByText('Input Parameters')).not.toBeInTheDocument();
      // There are multiple "Error" text elements (one in header, one in content)
      const errors = screen.getAllByText('Error');
      expect(errors.length).toBeGreaterThan(0);
      expect(screen.getByText('Tool failed')).toBeInTheDocument();
    });

    it('should manage multiple tool toggles independently', () => {
      const invocations = [
        {
          toolName: 'tool-1',
          args: { data1: 'value1' },
          state: 'result' as const
        },
        {
          toolName: 'tool-2',
          args: { data2: 'value2' },
          state: 'result' as const
        }
      ];

      render(<ToolSection toolInvocations={invocations} />);

      // Expand first tool
      fireEvent.click(screen.getByText('tool-1'));
      expect(screen.getByText(/data1.*value1/)).toBeInTheDocument();
      expect(screen.queryByText(/data2.*value2/)).not.toBeInTheDocument();

      // Expand second tool
      fireEvent.click(screen.getByText('tool-2'));
      expect(screen.getByText(/data1.*value1/)).toBeInTheDocument();
      expect(screen.getByText(/data2.*value2/)).toBeInTheDocument();

      // Collapse first tool
      fireEvent.click(screen.getByText('tool-1'));
      expect(screen.queryByText(/data1.*value1/)).not.toBeInTheDocument();
      expect(screen.getByText(/data2.*value2/)).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const invocations = [{ toolName: 'test', state: 'result' as const }];
      const { container } = render(
        <ToolSection toolInvocations={invocations} className="custom-section-class" />
      );

      const sectionWrapper = container.firstChild as HTMLElement;
      expect(sectionWrapper).toHaveClass('custom-section-class');
    });
  });

  describe('Integration Tests', () => {
    it('should work together as complete tool visualization system', () => {
      const invocations = [
        {
          toolName: 'file-reader',
          args: { path: '/test/file.txt', encoding: 'utf8' },
          result: 'File content here',
          state: 'result' as const
        },
        {
          toolName: 'api-call',
          args: { url: 'https://api.example.com', method: 'GET' },
          error: 'Network timeout',
          state: 'error' as const
        }
      ];

      render(<ToolSection toolInvocations={invocations} />);

      // Should show both tools with correct states
      expect(screen.getByText('file-reader')).toBeInTheDocument();
      expect(screen.getByText('api-call')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();

      // Expand first tool
      fireEvent.click(screen.getByText('file-reader'));
      expect(screen.getByText('Input Parameters')).toBeInTheDocument();
      expect(screen.getByText('Output')).toBeInTheDocument();
      expect(screen.getByText(/path.*\/test\/file\.txt/)).toBeInTheDocument();
      expect(screen.getByText('File content here')).toBeInTheDocument();

      // Expand second tool
      fireEvent.click(screen.getByText('api-call'));
      expect(screen.getAllByText('Input Parameters')).toHaveLength(2);
      // Multiple "Error" texts expected (header and content)
      const errors = screen.getAllByText('Error');
      expect(errors.length).toBeGreaterThan(0);
      expect(screen.getByText(/url.*https:\/\/api\.example\.com/)).toBeInTheDocument();
      expect(screen.getByText('Network timeout')).toBeInTheDocument();
    });

    it('should handle complex nested data structures', () => {
      const invocations = [
        {
          toolName: 'complex-tool',
          args: {
            config: {
              database: {
                host: 'localhost',
                port: 5432,
                tables: ['users', 'orders', 'products']
              },
              cache: {
                redis: true,
                ttl: 3600
              }
            },
            options: ['verbose', 'dry-run']
          },
          result: {
            status: 'success',
            records: 1250,
            metadata: {
              duration: '2.3s',
              memory: '45MB'
            }
          },
          state: 'result' as const
        }
      ];

      render(<ToolSection toolInvocations={invocations} />);

      fireEvent.click(screen.getByText('complex-tool'));

      // Check nested input structure
      expect(screen.getByText(/host.*localhost/)).toBeInTheDocument();
      expect(screen.getByText(/port.*5432/)).toBeInTheDocument();
      expect(screen.getByText(/users/)).toBeInTheDocument();
      expect(screen.getByText(/redis.*true/)).toBeInTheDocument();
      expect(screen.getByText(/verbose/)).toBeInTheDocument();

      // Check nested output structure
      expect(screen.getByText(/records.*1250/)).toBeInTheDocument();
      expect(screen.getByText(/duration.*2\.3s/)).toBeInTheDocument();
    });

    it('should handle edge cases gracefully', () => {
      const invocations = [
        {
          toolName: '',
          args: null,
          result: undefined,
          state: undefined
        }
      ];

      render(<ToolSection toolInvocations={invocations} />);

      // Should not crash and show default values
      expect(screen.getByText('Preparing...')).toBeInTheDocument();
    });
  });
});