import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Branch,
  BranchMessages,
  BranchSelector,
  BranchPrevious,
  BranchNext,
  BranchPage,
} from '../../src/components/ai-elements/branch';
import { Button } from '../../src/components/ui/button';

// Mock the UI components
vi.mock('../../src/components/ui/button', () => ({
  Button: vi.fn(({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  )),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ChevronLeftIcon: ({ size }: { size: number }) => (
    <svg data-testid="chevron-left" width={size} height={size}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
  ChevronRightIcon: ({ size }: { size: number }) => (
    <svg data-testid="chevron-right" width={size} height={size}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
}));

// Mock utils
vi.mock('../../src/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

describe('Branch Components', () => {
  describe('Branch Context Provider', () => {
    it('should render children within context provider', () => {
      render(
        <Branch>
          <div>Branch content</div>
        </Branch>
      );

      expect(screen.getByText('Branch content')).toBeInTheDocument();
    });

    it('should apply custom className and props to wrapper div', () => {
      const { container } = render(
        <Branch className="custom-class" data-testid="branch-wrapper">
          <div>Content</div>
        </Branch>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('grid', 'w-full', 'gap-2', 'custom-class');
      expect(wrapper).toHaveAttribute('data-testid', 'branch-wrapper');
    });

    it('should use default branch index when not specified', () => {
      render(
        <Branch>
          <BranchPage />
        </Branch>
      );

      expect(screen.getByText('1 of 0')).toBeInTheDocument();
    });

    it('should use custom default branch index', () => {
      render(
        <Branch defaultBranch={2}>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
            <div key="branch3">Branch 3</div>
          </BranchMessages>
          <BranchPage />
        </Branch>
      );

      expect(screen.getByText('3 of 3')).toBeInTheDocument();
    });

    it('should call onBranchChange when branch changes', () => {
      const onBranchChange = vi.fn();
      
      render(
        <Branch onBranchChange={onBranchChange}>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchNext />
        </Branch>
      );

      fireEvent.click(screen.getByRole('button', { name: /next branch/i }));
      expect(onBranchChange).toHaveBeenCalledWith(1);
    });
  });

  describe('BranchMessages', () => {
    it('should render single child branch', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Single Branch</div>
          </BranchMessages>
        </Branch>
      );

      expect(screen.getByText('Single Branch')).toBeInTheDocument();
    });

    it('should render multiple branch children', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
            <div key="branch3">Branch 3</div>
          </BranchMessages>
        </Branch>
      );

      // Only current branch (index 0) should be visible
      expect(screen.getByText('Branch 1')).toBeInTheDocument();
      expect(screen.queryByText('Branch 2')).toBeInTheDocument(); // Hidden but in DOM
      expect(screen.queryByText('Branch 3')).toBeInTheDocument(); // Hidden but in DOM
    });

    it('should show only current branch and hide others', () => {
      render(
        <Branch defaultBranch={1}>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
            <div key="branch3">Branch 3</div>
          </BranchMessages>
        </Branch>
      );

      // Check visibility classes on the container divs
      const branch1Container = screen.getByText('Branch 1').parentElement;
      const branch2Container = screen.getByText('Branch 2').parentElement;
      const branch3Container = screen.getByText('Branch 3').parentElement;

      expect(branch1Container).toHaveClass('hidden');
      expect(branch2Container).toHaveClass('block');
      expect(branch3Container).toHaveClass('hidden');
    });

    it('should handle custom props and className', () => {
      render(
        <Branch>
          <BranchMessages data-testid="branch-messages">
            <div key="branch1">Branch 1</div>
          </BranchMessages>
        </Branch>
      );

      const branchContainer = screen.getByText('Branch 1').parentElement;
      expect(branchContainer).toHaveAttribute('data-testid', 'branch-messages');
    });

    it('should update branches when children change', () => {
      const { rerender } = render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
          </BranchMessages>
          <BranchPage />
        </Branch>
      );

      expect(screen.getByText('1 of 1')).toBeInTheDocument();

      rerender(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchPage />
        </Branch>
      );

      expect(screen.getByText('1 of 2')).toBeInTheDocument();
    });
  });

  describe('BranchSelector', () => {
    it('should not render when there is only one branch or less', () => {
      const { container } = render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Single Branch</div>
          </BranchMessages>
          <BranchSelector from="assistant" />
        </Branch>
      );

      // BranchSelector should return null and not be in DOM
      const selector = container.querySelector('.flex');
      expect(selector).toBeNull();
    });

    it('should render when there are multiple branches', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchSelector from="assistant" data-testid="branch-selector" />
        </Branch>
      );

      const selector = screen.getByTestId('branch-selector');
      expect(selector).toHaveClass('flex', 'items-center', 'gap-2');
    });

    it('should apply correct alignment for assistant messages', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchSelector from="assistant" data-testid="selector" />
        </Branch>
      );

      const selector = screen.getByTestId('selector');
      expect(selector).toHaveClass('justify-start');
    });

    it('should apply correct alignment for user messages', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchSelector from="user" data-testid="selector" />
        </Branch>
      );

      const selector = screen.getByTestId('selector');
      expect(selector).toHaveClass('justify-end');
    });

    it('should handle custom className and props', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchSelector from="assistant" className="custom-class" data-testid="custom-selector" />
        </Branch>
      );

      const selector = screen.getByTestId('custom-selector');
      expect(selector).toHaveClass('custom-class');
      expect(selector).toHaveAttribute('data-testid', 'custom-selector');
    });
  });

  describe('BranchPrevious', () => {
    it('should render previous button with default icon', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchPrevious />
        </Branch>
      );

      const button = screen.getByRole('button', { name: /previous branch/i });
      expect(button).toBeInTheDocument();
      expect(screen.getByTestId('chevron-left')).toBeInTheDocument();
    });

    it('should render custom children instead of default icon', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchPrevious>Custom Prev</BranchPrevious>
        </Branch>
      );

      expect(screen.getByText('Custom Prev')).toBeInTheDocument();
      expect(screen.queryByTestId('chevron-left')).not.toBeInTheDocument();
    });

    it('should be disabled when there is only one branch', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Single Branch</div>
          </BranchMessages>
          <BranchPrevious />
        </Branch>
      );

      const button = screen.getByRole('button', { name: /previous branch/i });
      expect(button).toBeDisabled();
    });

    it('should be enabled when there are multiple branches', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchPrevious />
        </Branch>
      );

      const button = screen.getByRole('button', { name: /previous branch/i });
      expect(button).not.toBeDisabled();
    });

    it('should navigate to previous branch when clicked', () => {
      render(
        <Branch defaultBranch={1}>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchPrevious />
          <BranchPage />
        </Branch>
      );

      expect(screen.getByText('2 of 2')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /previous branch/i }));
      expect(screen.getByText('1 of 2')).toBeInTheDocument();
    });

    it('should wrap around to last branch when at first branch', () => {
      render(
        <Branch defaultBranch={0}>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
            <div key="branch3">Branch 3</div>
          </BranchMessages>
          <BranchPrevious />
          <BranchPage />
        </Branch>
      );

      expect(screen.getByText('1 of 3')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /previous branch/i }));
      expect(screen.getByText('3 of 3')).toBeInTheDocument();
    });

    it('should handle custom props and className', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchPrevious className="custom-prev" data-testid="prev-btn" />
        </Branch>
      );

      const button = screen.getByTestId('prev-btn');
      expect(button).toHaveClass('custom-prev');
    });
  });

  describe('BranchNext', () => {
    it('should render next button with default icon', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchNext />
        </Branch>
      );

      const button = screen.getByRole('button', { name: /next branch/i });
      expect(button).toBeInTheDocument();
      expect(screen.getByTestId('chevron-right')).toBeInTheDocument();
    });

    it('should render custom children instead of default icon', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchNext>Custom Next</BranchNext>
        </Branch>
      );

      expect(screen.getByText('Custom Next')).toBeInTheDocument();
      expect(screen.queryByTestId('chevron-right')).not.toBeInTheDocument();
    });

    it('should be disabled when there is only one branch', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Single Branch</div>
          </BranchMessages>
          <BranchNext />
        </Branch>
      );

      const button = screen.getByRole('button', { name: /next branch/i });
      expect(button).toBeDisabled();
    });

    it('should be enabled when there are multiple branches', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchNext />
        </Branch>
      );

      const button = screen.getByRole('button', { name: /next branch/i });
      expect(button).not.toBeDisabled();
    });

    it('should navigate to next branch when clicked', () => {
      render(
        <Branch defaultBranch={0}>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchNext />
          <BranchPage />
        </Branch>
      );

      expect(screen.getByText('1 of 2')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /next branch/i }));
      expect(screen.getByText('2 of 2')).toBeInTheDocument();
    });

    it('should wrap around to first branch when at last branch', () => {
      render(
        <Branch defaultBranch={2}>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
            <div key="branch3">Branch 3</div>
          </BranchMessages>
          <BranchNext />
          <BranchPage />
        </Branch>
      );

      expect(screen.getByText('3 of 3')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /next branch/i }));
      expect(screen.getByText('1 of 3')).toBeInTheDocument();
    });

    it('should handle custom props and className', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchNext className="custom-next" data-testid="next-btn" />
        </Branch>
      );

      const button = screen.getByTestId('next-btn');
      expect(button).toHaveClass('custom-next');
    });
  });

  describe('BranchPage', () => {
    it('should display correct page information', () => {
      render(
        <Branch defaultBranch={1}>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
            <div key="branch3">Branch 3</div>
          </BranchMessages>
          <BranchPage />
        </Branch>
      );

      expect(screen.getByText('2 of 3')).toBeInTheDocument();
    });

    it('should update when branch changes', () => {
      render(
        <Branch defaultBranch={0}>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchNext />
          <BranchPage />
        </Branch>
      );

      expect(screen.getByText('1 of 2')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /next branch/i }));
      expect(screen.getByText('2 of 2')).toBeInTheDocument();
    });

    it('should handle custom className and props', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
          </BranchMessages>
          <BranchPage className="custom-page" data-testid="page-info" />
        </Branch>
      );

      const pageInfo = screen.getByTestId('page-info');
      expect(pageInfo).toHaveClass('custom-page');
      expect(pageInfo).toHaveTextContent('1 of 1');
    });

    it('should display correct format with zero branches', () => {
      render(
        <Branch>
          <BranchPage />
        </Branch>
      );

      expect(screen.getByText('1 of 0')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when branch components used outside Branch context', () => {
      // Mock console.error to prevent error output in tests
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<BranchPage />);
      }).toThrow('Branch components must be used within Branch');

      expect(() => {
        render(<BranchPrevious />);
      }).toThrow('Branch components must be used within Branch');

      expect(() => {
        render(<BranchNext />);
      }).toThrow('Branch components must be used within Branch');

      expect(() => {
        render(<BranchSelector from="user" />);
      }).toThrow('Branch components must be used within Branch');

      expect(() => {
        render(<BranchMessages><div>Test</div></BranchMessages>);
      }).toThrow('Branch components must be used within Branch');

      consoleSpy.mockRestore();
    });
  });

  describe('Integration Tests', () => {
    it('should work together as complete branch navigation system', () => {
      render(
        <Branch>
          <BranchMessages>
            <div key="branch1">First Response</div>
            <div key="branch2">Alternative Response</div>
            <div key="branch3">Third Option</div>
          </BranchMessages>
          <BranchSelector from="assistant">
            <BranchPrevious />
            <BranchPage />
            <BranchNext />
          </BranchSelector>
        </Branch>
      );

      // Initial state
      expect(screen.getByText('First Response')).toBeInTheDocument();
      expect(screen.getByText('1 of 3')).toBeInTheDocument();

      // Navigate to next
      fireEvent.click(screen.getByRole('button', { name: /next branch/i }));
      expect(screen.getByText('2 of 3')).toBeInTheDocument();

      // Navigate to next again
      fireEvent.click(screen.getByRole('button', { name: /next branch/i }));
      expect(screen.getByText('3 of 3')).toBeInTheDocument();

      // Navigate to previous
      fireEvent.click(screen.getByRole('button', { name: /previous branch/i }));
      expect(screen.getByText('2 of 3')).toBeInTheDocument();

      // Wrap around navigation
      fireEvent.click(screen.getByRole('button', { name: /next branch/i }));
      fireEvent.click(screen.getByRole('button', { name: /next branch/i }));
      expect(screen.getByText('1 of 3')).toBeInTheDocument();
    });

    it('should handle branch change callback throughout navigation', () => {
      const onBranchChange = vi.fn();
      
      render(
        <Branch onBranchChange={onBranchChange}>
          <BranchMessages>
            <div key="branch1">Branch 1</div>
            <div key="branch2">Branch 2</div>
          </BranchMessages>
          <BranchNext />
          <BranchPrevious />
        </Branch>
      );

      fireEvent.click(screen.getByRole('button', { name: /next branch/i }));
      expect(onBranchChange).toHaveBeenCalledWith(1);

      fireEvent.click(screen.getByRole('button', { name: /previous branch/i }));
      expect(onBranchChange).toHaveBeenCalledWith(0);

      expect(onBranchChange).toHaveBeenCalledTimes(2);
    });
  });
});