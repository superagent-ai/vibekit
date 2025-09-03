import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
const originalClipboard = navigator.clipboard;
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: mockWriteText,
  },
  writable: true,
  configurable: true,
});

// Mock setTimeout and clearTimeout for copy button timeout
const mockSetTimeout = vi.fn((fn: () => void, delay?: number) => {
  return setTimeout(() => fn(), 0); // Execute with minimal delay
});
const mockClearTimeout = vi.fn();
vi.stubGlobal('setTimeout', mockSetTimeout);
vi.stubGlobal('clearTimeout', mockClearTimeout);

describe('CodeBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteText.mockResolvedValue(undefined);
  });

  describe('Basic Rendering', () => {
    it('should render code with syntax highlighter', () => {
      const code = 'console.log("Hello World");';
      render(<CodeBlock code={code} language="javascript" />);
      
      expect(screen.getByText(code)).toBeInTheDocument();
      
      const syntaxHighlighter = screen.getByTestId('syntax-highlighter');
      expect(syntaxHighlighter).toHaveAttribute('data-language', 'javascript');
    });

    it('should render with custom className', () => {
      render(
        <CodeBlock 
          code="test" 
          language="javascript" 
          className="custom-class" 
          data-testid="codeblock"
        />
      );
      
      const codeblock = screen.getByTestId('codeblock');
      expect(codeblock).toHaveClass('custom-class');
      expect(codeblock).toHaveClass('relative', 'w-full', 'overflow-hidden');
    });

    it('should handle line numbers prop', () => {
      render(<CodeBlock code="test" language="javascript" showLineNumbers={true} />);
      
      const syntaxHighlighter = screen.getByTestId('syntax-highlighter');
      expect(syntaxHighlighter).toHaveAttribute('data-line-numbers', 'true');
      expect(screen.getByText('test')).toBeInTheDocument();
    });

    it('should handle line numbers prop when false', () => {
      render(<CodeBlock code="test" language="javascript" showLineNumbers={false} />);
      
      const syntaxHighlighter = screen.getByTestId('syntax-highlighter');
      expect(syntaxHighlighter).toHaveAttribute('data-line-numbers', 'false');
    });

    it('should default line numbers to false', () => {
      render(<CodeBlock code="test" language="javascript" />);
      
      const syntaxHighlighter = screen.getByTestId('syntax-highlighter');
      expect(syntaxHighlighter).toHaveAttribute('data-line-numbers', 'false');
    });
  });

  describe('Language Support', () => {
    it('should support different languages', () => {
      const { rerender } = render(<CodeBlock code="print('hello')" language="python" />);
      
      let syntaxHighlighter = screen.getByTestId('syntax-highlighter');
      expect(syntaxHighlighter).toHaveAttribute('data-language', 'python');
      
      rerender(<CodeBlock code="const x: string = 'test'" language="typescript" />);
      syntaxHighlighter = screen.getByTestId('syntax-highlighter');
      expect(syntaxHighlighter).toHaveAttribute('data-language', 'typescript');
    });

    it('should handle various programming languages', () => {
      const languages = ['javascript', 'python', 'typescript', 'java', 'c++', 'rust', 'go'];
      
      languages.forEach(language => {
        const { unmount } = render(<CodeBlock code={`// ${language} code`} language={language} />);
        
        const syntaxHighlighter = screen.getByTestId('syntax-highlighter');
        expect(syntaxHighlighter).toHaveAttribute('data-language', language);
        
        unmount();
      });
    });
  });

  describe('Children Rendering', () => {
    it('should render children when provided', () => {
      render(
        <CodeBlock code="test" language="javascript">
          <div data-testid="custom-child">Custom child content</div>
        </CodeBlock>
      );
      
      expect(screen.getByText('test')).toBeInTheDocument();
      expect(screen.getByTestId('custom-child')).toBeInTheDocument();
      expect(screen.getByText('Custom child content')).toBeInTheDocument();
    });

    it('should not render children container when no children provided', () => {
      render(<CodeBlock code="test" language="javascript" />);
      
      expect(screen.getByText('test')).toBeInTheDocument();
      // The children container should not exist
      expect(screen.queryByText('Custom child content')).not.toBeInTheDocument();
    });

    it('should render multiple children', () => {
      render(
        <CodeBlock code="test" language="javascript">
          <button>Copy</button>
          <button>Save</button>
        </CodeBlock>
      );
      
      expect(screen.getByText('Copy')).toBeInTheDocument();
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });

  describe('Props Handling', () => {
    it('should pass through additional props', () => {
      render(
        <CodeBlock 
          code="test" 
          language="javascript"
          data-testid="codeblock"
          id="test-codeblock"
          role="region"
        />
      );
      
      const codeblock = screen.getByTestId('codeblock');
      expect(codeblock).toHaveAttribute('id', 'test-codeblock');
      expect(codeblock).toHaveAttribute('role', 'region');
    });

    it('should handle empty code', () => {
      render(<CodeBlock code="" language="javascript" />);
      
      const syntaxHighlighter = screen.getByTestId('syntax-highlighter');
      expect(syntaxHighlighter).toBeInTheDocument();
    });
  });
});

describe('CodeBlockCopyButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteText.mockResolvedValue(undefined);
  });

  describe('Basic Rendering', () => {
    it('should render with copy icon by default', () => {
      render(
        <CodeBlock code="test code" language="javascript">
          <CodeBlockCopyButton data-testid="copy-button" />
        </CodeBlock>
      );
      
      const button = screen.getByTestId('copy-button');
      expect(button).toBeInTheDocument();
      expect(screen.getByTestId('copy-icon')).toBeInTheDocument();
      expect(screen.queryByTestId('check-icon')).not.toBeInTheDocument();
    });

    it('should render with custom children', () => {
      render(
        <CodeBlock code="test code" language="javascript">
          <CodeBlockCopyButton data-testid="copy-button">
            Custom Copy Text
          </CodeBlockCopyButton>
        </CodeBlock>
      );
      
      const button = screen.getByTestId('copy-button');
      expect(button).toBeInTheDocument();
      expect(screen.getByText('Custom Copy Text')).toBeInTheDocument();
      expect(screen.queryByTestId('copy-icon')).not.toBeInTheDocument();
    });
  });

  describe('Copy Button Integration', () => {
    it('should render copy button with icon', () => {
      render(
        <CodeBlock code="test code" language="javascript">
          <CodeBlockCopyButton data-testid="copy-button" />
        </CodeBlock>
      );
      
      const button = screen.getByTestId('copy-button');
      expect(button).toBeInTheDocument();
      expect(screen.getByTestId('copy-icon')).toBeInTheDocument();
    });

    it('should render with custom children', () => {
      render(
        <CodeBlock code="test code" language="javascript">
          <CodeBlockCopyButton data-testid="copy-button">
            Custom Copy Text
          </CodeBlockCopyButton>
        </CodeBlock>
      );
      
      expect(screen.getByText('Custom Copy Text')).toBeInTheDocument();
      expect(screen.queryByTestId('copy-icon')).not.toBeInTheDocument();
    });

    it('should handle button interactions', () => {
      render(
        <CodeBlock code="test code" language="javascript">
          <CodeBlockCopyButton data-testid="copy-button" />
        </CodeBlock>
      );
      
      const button = screen.getByTestId('copy-button');
      
      // Should be clickable without crashing
      expect(() => fireEvent.click(button)).not.toThrow();
      expect(button).toBeInTheDocument();
    });
  });

  describe('Props Handling', () => {
    it('should pass through button props', () => {
      render(
        <CodeBlock code="test code" language="javascript">
          <CodeBlockCopyButton 
            data-testid="copy-button"
            className="custom-copy-class"
            disabled
            id="copy-btn"
          />
        </CodeBlock>
      );
      
      const button = screen.getByTestId('copy-button');
      expect(button).toHaveClass('custom-copy-class');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('id', 'copy-btn');
    });

    it('should have default button styling', () => {
      render(
        <CodeBlock code="test code" language="javascript">
          <CodeBlockCopyButton data-testid="copy-button" />
        </CodeBlock>
      );
      
      const button = screen.getByTestId('copy-button');
      expect(button).toHaveClass('shrink-0');
    });
  });
});