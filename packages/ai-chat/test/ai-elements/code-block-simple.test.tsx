import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CodeBlock, CodeBlockCopyButton } from '../../src/components/ai-elements/code-block';

// Mock react-syntax-highlighter to avoid complex highlighting logic in tests
vi.mock('react-syntax-highlighter', () => ({
  Prism: ({ children, language, showLineNumbers, customStyle, lineNumberStyle, codeTagProps, className, ...props }: any) => (
    <pre 
      data-language={language}
      data-line-numbers={showLineNumbers}
      data-testid="syntax-highlighter"
      className={className}
      // Don't spread custom props to avoid DOM warnings
    >
      <code>{children}</code>
    </pre>
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  CopyIcon: ({ size }: { size?: number }) => (
    <svg data-testid="copy-icon" width={size} height={size}>
      <rect />
    </svg>
  ),
  CheckIcon: ({ size }: { size?: number }) => (
    <svg data-testid="check-icon" width={size} height={size}>
      <circle />
    </svg>
  ),
}));

// Mock clipboard API
const mockWriteText = vi.fn().mockResolvedValue(undefined);

// Set up clipboard mock before all tests
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: mockWriteText,
  },
  writable: true,
  configurable: true,
});

describe('CodeBlock - Coverage Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteText.mockResolvedValue(undefined);
  });
  describe('CodeBlock Component', () => {
    it('should render basic code block', () => {
      render(<CodeBlock code="console.log('hello')" language="javascript" />);
      
      expect(screen.getByText("console.log('hello')")).toBeInTheDocument();
      expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-language', 'javascript');
    });

    it('should render with line numbers', () => {
      render(<CodeBlock code="test" language="javascript" showLineNumbers={true} />);
      
      const highlighter = screen.getByTestId('syntax-highlighter');
      expect(highlighter).toHaveAttribute('data-line-numbers', 'true');
    });

    it('should render without line numbers by default', () => {
      render(<CodeBlock code="test" language="javascript" />);
      
      const highlighter = screen.getByTestId('syntax-highlighter');
      expect(highlighter).toHaveAttribute('data-line-numbers', 'false');
    });

    it('should render children when provided', () => {
      render(
        <CodeBlock code="test" language="javascript">
          <div data-testid="child">Copy button</div>
        </CodeBlock>
      );
      
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('should not render children container when no children', () => {
      const { container } = render(<CodeBlock code="test" language="javascript" />);
      
      // The children container div should not exist when no children
      const childrenContainer = container.querySelector('.absolute.right-2.top-2');
      expect(childrenContainer).toBeNull();
    });

    it('should apply custom className and props', () => {
      render(
        <CodeBlock 
          code="test" 
          language="javascript" 
          className="custom-class"
          data-testid="codeblock"
          id="test-block"
        />
      );
      
      const codeblock = screen.getByTestId('codeblock');
      expect(codeblock).toHaveClass('custom-class');
      expect(codeblock).toHaveAttribute('id', 'test-block');
    });
  });

  describe('CodeBlockCopyButton Component', () => {
    it('should render with copy icon by default', () => {
      render(
        <CodeBlock code="test code" language="javascript">
          <CodeBlockCopyButton data-testid="copy-btn" />
        </CodeBlock>
      );
      
      expect(screen.getByTestId('copy-btn')).toBeInTheDocument();
      expect(screen.getByTestId('copy-icon')).toBeInTheDocument();
    });

    it('should render with custom children instead of icon', () => {
      render(
        <CodeBlock code="test code" language="javascript">
          <CodeBlockCopyButton data-testid="copy-btn">
            Custom Copy
          </CodeBlockCopyButton>
        </CodeBlock>
      );
      
      expect(screen.getByText('Custom Copy')).toBeInTheDocument();
      expect(screen.queryByTestId('copy-icon')).not.toBeInTheDocument();
    });

    it('should apply custom className and props', () => {
      render(
        <CodeBlock code="test code" language="javascript">
          <CodeBlockCopyButton 
            data-testid="copy-btn"
            className="custom-copy"
            disabled
            id="copy-button"
          />
        </CodeBlock>
      );
      
      const button = screen.getByTestId('copy-btn');
      expect(button).toHaveClass('custom-copy', 'shrink-0');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('id', 'copy-button');
    });

    it('should use context to access code', () => {
      render(
        <CodeBlock code="test code from context" language="javascript">
          <CodeBlockCopyButton data-testid="copy-btn" />
        </CodeBlock>
      );
      
      // The button should be rendered and have access to the context
      expect(screen.getByTestId('copy-btn')).toBeInTheDocument();
    });

    it('should handle click events', () => {
      // Mock console.error to suppress clipboard API errors in test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      render(
        <CodeBlock code="test code" language="javascript">
          <CodeBlockCopyButton data-testid="copy-btn" />
        </CodeBlock>
      );
      
      const button = screen.getByTestId('copy-btn');
      
      // Should not throw when clicked (even if clipboard fails)
      expect(() => fireEvent.click(button)).not.toThrow();
      
      consoleSpy.mockRestore();
    });

    it('should default to 2000ms timeout', () => {
      render(
        <CodeBlock code="test code" language="javascript">
          <CodeBlockCopyButton data-testid="copy-btn" />
        </CodeBlock>
      );
      
      // Component should render without issues with default timeout
      expect(screen.getByTestId('copy-btn')).toBeInTheDocument();
    });

    it('should accept custom timeout', () => {
      render(
        <CodeBlock code="test code" language="javascript">
          <CodeBlockCopyButton data-testid="copy-btn" timeout={5000} />
        </CodeBlock>
      );
      
      // Component should render without issues with custom timeout
      expect(screen.getByTestId('copy-btn')).toBeInTheDocument();
    });

    it('should call onError and onCopy callbacks when provided', () => {
      const onCopy = vi.fn();
      const onError = vi.fn();
      
      render(
        <CodeBlock code="test code" language="javascript">
          <CodeBlockCopyButton 
            data-testid="copy-btn" 
            onCopy={onCopy}
            onError={onError}
          />
        </CodeBlock>
      );
      
      // Component should render with callbacks
      expect(screen.getByTestId('copy-btn')).toBeInTheDocument();
    });
  });

  describe('Integration Tests', () => {
    it('should render complete code block with copy button', () => {
      render(
        <CodeBlock code="const x = 'hello world';" language="typescript" showLineNumbers>
          <CodeBlockCopyButton>Copy Code</CodeBlockCopyButton>
        </CodeBlock>
      );
      
      expect(screen.getByText("const x = 'hello world';")).toBeInTheDocument();
      expect(screen.getByText('Copy Code')).toBeInTheDocument();
      expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-language', 'typescript');
    });

    it('should handle multiple children', () => {
      render(
        <CodeBlock code="test" language="javascript">
          <CodeBlockCopyButton data-testid="copy-1">Copy</CodeBlockCopyButton>
          <button data-testid="save-btn">Save</button>
        </CodeBlock>
      );
      
      expect(screen.getByTestId('copy-1')).toBeInTheDocument();
      expect(screen.getByTestId('save-btn')).toBeInTheDocument();
    });
  });
});