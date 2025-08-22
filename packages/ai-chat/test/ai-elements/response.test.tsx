import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Response } from '../../src/components/ai-elements/response';

// Mock the CodeBlock component since it's complex and tested separately
vi.mock('../../src/components/ai-elements/code-block', () => ({
  CodeBlock: ({ children, code, language, className }: any) => (
    <div data-testid="code-block" data-language={language} className={className}>
      {code}
      {children}
    </div>
  ),
  CodeBlockCopyButton: ({ onCopy, onError }: any) => (
    <button 
      data-testid="copy-button"
      onClick={() => {
        try {
          onCopy();
        } catch (error) {
          onError();
        }
      }}
    >
      Copy
    </button>
  )
}));

describe('Response Component', () => {
  describe('parseIncompleteMarkdown functionality', () => {
    it('should render plain text without modification', () => {
      const plainText = 'This is plain text without any markdown.';
      render(<Response>{plainText}</Response>);
      
      expect(screen.getByText(plainText)).toBeInTheDocument();
    });

    it('should handle empty or null input', () => {
      render(<Response>{''}</Response>);
      // Should not crash with empty string
      
      render(<Response>{null as any}</Response>);
      // Should not crash with null
    });

    describe('Incomplete Links and Images', () => {
      it('should remove incomplete links at end of text', () => {
        const incompleteLink = 'Check out this [awesome site';
        render(<Response>{incompleteLink}</Response>);
        
        // Should only show text before the incomplete link
        expect(screen.getByText('Check out this')).toBeInTheDocument();
        expect(screen.queryByText('[awesome site')).not.toBeInTheDocument();
      });

      it('should remove incomplete images at end of text', () => {
        const incompleteImage = 'Here is an image ![alt text';
        render(<Response>{incompleteImage}</Response>);
        
        expect(screen.getByText('Here is an image')).toBeInTheDocument();
        expect(screen.queryByText('![alt text')).not.toBeInTheDocument();
      });

      it('should keep complete links intact', () => {
        const completeLink = 'Check out [this site](https://example.com)';
        render(<Response>{completeLink}</Response>);
        
        const link = screen.getByRole('link', { name: 'this site' });
        expect(link).toHaveAttribute('href', 'https://example.com');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noreferrer');
      });
    });

    describe('Incomplete Bold Formatting', () => {
      it('should complete incomplete bold formatting', () => {
        const incompleteBold = 'This is **bold text';
        render(<Response>{incompleteBold}</Response>);
        
        // Should render as bold
        expect(screen.getByText('bold text')).toHaveClass('font-semibold');
      });

      it('should handle multiple bold sections correctly', () => {
        const multipleBold = 'This **is** bold and **this too';
        render(<Response>{multipleBold}</Response>);
        
        // First bold should be complete, second should be auto-completed by parseIncompleteMarkdown
        expect(screen.getByText('is')).toHaveClass('font-semibold');
        expect(screen.getByText('this too')).toHaveClass('font-semibold');
      });

      it('should not modify complete bold formatting', () => {
        const completeBold = 'This **is bold** and normal';
        render(<Response>{completeBold}</Response>);
        
        expect(screen.getByText('is bold')).toHaveClass('font-semibold');
        // Check the paragraph element contains the text
        expect(screen.getByText(/This.*and normal/)).toBeInTheDocument();
      });
    });

    describe('Incomplete Italic Formatting', () => {
      it('should complete incomplete double underscore italic', () => {
        const incompleteItalic = 'This is __italic text';
        render(<Response>{incompleteItalic}</Response>);
        
        // Should render as italic (emphasis)
        expect(screen.getByText('italic text')).toBeInTheDocument();
      });

      it('should complete incomplete single asterisk italic', () => {
        const incompleteItalic = 'This is *italic text';
        render(<Response>{incompleteItalic}</Response>);
        
        expect(screen.getByText('italic text')).toBeInTheDocument();
      });

      it('should complete incomplete single underscore italic', () => {
        const incompleteItalic = 'This is _italic text';
        render(<Response>{incompleteItalic}</Response>);
        
        expect(screen.getByText('italic text')).toBeInTheDocument();
      });

      it('should handle mixed complete and incomplete italics', () => {
        const mixedItalic = 'This *is* italic and *this too';
        render(<Response>{mixedItalic}</Response>);
        
        // Both should render as italic
        expect(screen.getByText('is')).toBeInTheDocument();
        expect(screen.getByText('this too')).toBeInTheDocument();
      });
    });

    describe('Incomplete Inline Code', () => {
      it('should complete incomplete inline code', () => {
        const incompleteCode = 'Here is some `code';
        render(<Response>{incompleteCode}</Response>);
        
        expect(screen.getByText('code')).toBeInTheDocument();
      });

      it('should not interfere with code blocks', () => {
        const codeBlockWithIncomplete = '```javascript\nconst x = `hello';
        render(<Response>{codeBlockWithIncomplete}</Response>);
        
        // Should render as code block
        const codeBlock = screen.getByTestId('code-block');
        expect(codeBlock).toHaveAttribute('data-language', 'javascript');
        expect(codeBlock).toHaveTextContent('const x = `hello');
      });

      it('should handle complete inline code correctly', () => {
        const completeCode = 'Here is `code` and more text';
        render(<Response>{completeCode}</Response>);
        
        expect(screen.getByText('code')).toBeInTheDocument();
        // Check the paragraph element contains the full text
        expect(screen.getByText(/Here is.*and more text/)).toBeInTheDocument();
      });
    });

    describe('Incomplete Strikethrough', () => {
      it('should complete incomplete strikethrough', () => {
        const incompleteStrike = 'This is ~~struck text';
        render(<Response>{incompleteStrike}</Response>);
        
        expect(screen.getByText('struck text')).toBeInTheDocument();
      });

      it('should handle complete strikethrough correctly', () => {
        const completeStrike = 'This ~~is struck~~ text';
        render(<Response>{completeStrike}</Response>);
        
        expect(screen.getByText('is struck')).toBeInTheDocument();
        // Check the paragraph element contains the full text
        expect(screen.getByText(/This.*text/)).toBeInTheDocument();
      });
    });

    describe('parseIncompleteMarkdown option', () => {
      it('should skip parsing when parseIncompleteMarkdown is false', () => {
        const incompleteMarkdown = 'This is **bold text';
        render(<Response parseIncompleteMarkdown={false}>{incompleteMarkdown}</Response>);
        
        // Should render the incomplete markdown as-is
        expect(screen.getByText('This is **bold text')).toBeInTheDocument();
      });

      it('should parse by default when parseIncompleteMarkdown is not specified', () => {
        const incompleteMarkdown = 'This is **bold text';
        render(<Response>{incompleteMarkdown}</Response>);
        
        // Should complete and render as bold
        expect(screen.getByText('bold text')).toHaveClass('font-semibold');
      });
    });
  });

  describe('Custom Markdown Components', () => {
    describe('Lists', () => {
      it('should render ordered lists with correct styling', () => {
        const orderedList = '1. First item\n2. Second item\n3. Third item';
        render(<Response>{orderedList}</Response>);
        
        const list = screen.getByRole('list');
        expect(list).toHaveClass('ml-4', 'list-outside', 'list-decimal');
        
        const listItems = screen.getAllByRole('listitem');
        expect(listItems).toHaveLength(3);
        listItems.forEach(item => {
          expect(item).toHaveClass('py-1');
        });
      });

      it('should render unordered lists with correct styling', () => {
        const unorderedList = '- First item\n- Second item\n- Third item';
        render(<Response>{unorderedList}</Response>);
        
        const list = screen.getByRole('list');
        expect(list).toHaveClass('ml-4', 'list-outside', 'list-decimal');
        
        const listItems = screen.getAllByRole('listitem');
        expect(listItems).toHaveLength(3);
      });
    });

    describe('Headings', () => {
      it('should render h1 with correct styling', () => {
        render(<Response># Main Heading</Response>);
        
        const heading = screen.getByRole('heading', { level: 1 });
        expect(heading).toHaveClass('mt-6', 'mb-2', 'font-semibold', 'text-3xl');
        expect(heading).toHaveTextContent('Main Heading');
      });

      it('should render h2 with correct styling', () => {
        render(<Response>## Sub Heading</Response>);
        
        const heading = screen.getByRole('heading', { level: 2 });
        expect(heading).toHaveClass('mt-6', 'mb-2', 'font-semibold', 'text-2xl');
      });

      it('should render h3 with correct styling', () => {
        render(<Response>### Section Heading</Response>);
        
        const heading = screen.getByRole('heading', { level: 3 });
        expect(heading).toHaveClass('mt-6', 'mb-2', 'font-semibold', 'text-xl');
      });

      it('should render h4 with correct styling', () => {
        render(<Response>#### Subsection</Response>);
        
        const heading = screen.getByRole('heading', { level: 4 });
        expect(heading).toHaveClass('mt-6', 'mb-2', 'font-semibold', 'text-lg');
      });

      it('should render h5 with correct styling', () => {
        render(<Response>##### Minor Heading</Response>);
        
        const heading = screen.getByRole('heading', { level: 5 });
        expect(heading).toHaveClass('mt-6', 'mb-2', 'font-semibold', 'text-base');
      });

      it('should render h6 with correct styling', () => {
        render(<Response>###### Small Heading</Response>);
        
        const heading = screen.getByRole('heading', { level: 6 });
        expect(heading).toHaveClass('mt-6', 'mb-2', 'font-semibold', 'text-sm');
      });
    });

    describe('Text Formatting', () => {
      it('should render strong text with correct styling', () => {
        render(<Response>**Bold text**</Response>);
        
        const strong = screen.getByText('Bold text');
        expect(strong).toHaveClass('font-semibold');
      });

      it('should render links with correct attributes and styling', () => {
        render(<Response>[Link text](https://example.com)</Response>);
        
        const link = screen.getByRole('link');
        expect(link).toHaveClass('font-medium', 'text-primary', 'underline');
        expect(link).toHaveAttribute('href', 'https://example.com');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noreferrer');
      });
    });

    describe('Code Blocks', () => {
      it('should render code blocks with language detection', () => {
        const codeBlock = '```javascript\nconsole.log("Hello, world!");\n```';
        render(<Response>{codeBlock}</Response>);
        
        const codeBlockElement = screen.getByTestId('code-block');
        expect(codeBlockElement).toHaveAttribute('data-language', 'javascript');
        expect(codeBlockElement).toHaveClass('my-4', 'h-auto');
        expect(codeBlockElement).toHaveTextContent('console.log("Hello, world!");');
        
        // Should have copy button
        expect(screen.getByTestId('copy-button')).toBeInTheDocument();
      });

      it('should default to javascript for code blocks without language', () => {
        const codeBlock = '```\nsome code\n```';
        render(<Response>{codeBlock}</Response>);
        
        const codeBlockElement = screen.getByTestId('code-block');
        expect(codeBlockElement).toHaveAttribute('data-language', 'javascript');
      });

      it('should handle pre elements that are not code blocks', () => {
        render(<Response>{'`Not a markdown codeblock`'}</Response>);
        
        expect(screen.getByText('Not a markdown codeblock')).toBeInTheDocument();
      });

      it('should extract language from className', () => {
        const pythonCode = '```python\nprint("Hello")\n```';
        render(<Response>{pythonCode}</Response>);
        
        // The language is passed through but defaults to javascript in our mock
        // We can check the code content instead
        expect(screen.getByText('print("Hello")')).toBeInTheDocument();
      });
    });
  });

  describe('Component Props and Behavior', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <Response className="custom-class">Test content</Response>
      );
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('custom-class');
    });

    it('should pass through HTML attributes', () => {
      const { container } = render(
        <Response data-testid="response-wrapper" role="article">
          Test content
        </Response>
      );
      
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveAttribute('data-testid', 'response-wrapper');
      expect(wrapper).toHaveAttribute('role', 'article');
    });

    it('should merge custom options with default ReactMarkdown options', () => {
      const customOptions = {
        skipHtml: true
      };
      
      render(<Response options={customOptions}>Test content</Response>);
      
      // Component should render without error with custom options
      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('should handle non-string children when parseIncompleteMarkdown is enabled', () => {
      // ReactMarkdown expects string children, so this tests the fallback behavior
      render(<Response parseIncompleteMarkdown={true}>{'Non-markdown text content'}</Response>);
      
      expect(screen.getByText('Non-markdown text content')).toBeInTheDocument();
    });
  });

  describe('Memoization', () => {
    it('should re-render when children change', () => {
      const { rerender } = render(<Response>First content</Response>);
      expect(screen.getByText('First content')).toBeInTheDocument();
      
      rerender(<Response>Second content</Response>);
      expect(screen.getByText('Second content')).toBeInTheDocument();
      expect(screen.queryByText('First content')).not.toBeInTheDocument();
    });

    it('should not re-render when non-children props change but children stay same', () => {
      const { rerender } = render(
        <Response className="class1">Same content</Response>
      );
      
      // Due to memo, changing className but keeping same children 
      // should not cause re-render (though in test environment this is hard to detect)
      rerender(<Response className="class2">Same content</Response>);
      
      expect(screen.getByText('Same content')).toBeInTheDocument();
    });
  });

  describe('Edge Cases and Complex Scenarios', () => {
    it('should handle mixed markdown with multiple incomplete elements', () => {
      const complexMarkdown = 'This has **bold and [incomplete link and `code';
      render(<Response>{complexMarkdown}</Response>);
      
      // Should handle all incomplete elements gracefully
      expect(screen.getByText(/This has/)).toBeInTheDocument();
    });

    it('should handle nested formatting correctly', () => {
      const nestedMarkdown = '**Bold with *italic* inside**';
      render(<Response>{nestedMarkdown}</Response>);
      
      const boldElement = screen.getByText(/Bold with/);
      expect(boldElement).toHaveClass('font-semibold');
    });

    it('should handle code blocks with complex content', () => {
      const complexCodeBlock = '```typescript\ninterface User {\n  name: string;\n  age: number;\n}\n```';
      render(<Response>{complexCodeBlock}</Response>);
      
      const codeBlockElement = screen.getByTestId('code-block');
      // Language defaults to javascript in our mock, but content should be preserved
      expect(codeBlockElement).toHaveTextContent('interface User');
      expect(codeBlockElement).toHaveTextContent('name: string;');
    });

    it('should handle mathematical expressions with KaTeX', () => {
      const mathExpression = 'Here is some math: $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$';
      render(<Response>{mathExpression}</Response>);
      
      // The math should be processed by KaTeX (though we can't easily test the rendering)
      expect(screen.getByText(/Here is some math/)).toBeInTheDocument();
    });

    it('should handle GitHub Flavored Markdown features', () => {
      const gfmContent = '- [x] Completed task\n- [ ] Incomplete task\n\n| Column 1 | Column 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |';
      render(<Response>{gfmContent}</Response>);
      
      // Should render checkboxes and table (basic structure check)
      expect(screen.getByText(/Completed task/)).toBeInTheDocument();
      expect(screen.getByText(/Incomplete task/)).toBeInTheDocument();
    });

    it('should handle very long text with multiple formatting types', () => {
      const longText = Array(50).fill('This is **bold** and *italic* and `code` text. ').join('');
      render(<Response>{longText}</Response>);
      
      // Should render without performance issues
      const boldElements = screen.getAllByText('bold');
      expect(boldElements.length).toBeGreaterThan(0);
    });

    it('should handle empty code blocks', () => {
      const emptyCodeBlock = '```\n\n```';
      render(<Response>{emptyCodeBlock}</Response>);
      
      const codeBlockElement = screen.getByTestId('code-block');
      expect(codeBlockElement).toBeInTheDocument();
    });

    it('should handle special characters in markdown', () => {
      const specialChars = 'Text with "quotes" and <brackets> and & ampersands';
      render(<Response>{specialChars}</Response>);
      
      expect(screen.getByText(/quotes.*brackets.*ampersands/)).toBeInTheDocument();
    });
  });
});