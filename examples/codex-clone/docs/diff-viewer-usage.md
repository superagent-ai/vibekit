# Diff Viewer Integration

This document explains how the new `react-diff-view` integration improves the display of check outputs and diffs in the application.

## Features

The DiffViewer component provides:

1. **Proper unified/split diff views** - Choose between unified (inline) or split (side-by-side) views
2. **Syntax-highlighted diffs** - Color-coded additions (green) and deletions (red)
3. **File statistics** - Shows number of additions and deletions per file
4. **Better context visualization** - Expandable hunks with proper line numbers
5. **Professional diff rendering** - Similar to GitHub's diff viewer

## Usage

### Basic Usage in TaskTimeline

The DiffViewer is automatically used in the TaskTimeline component when diff content is detected:

```typescript
// The component automatically detects diff content
if (isDiffContent(String(log.content))) {
  return <DiffViewer 
    diffContent={String(log.content)} 
    viewType="unified"
    className="my-2"
  />
}
```

### Standalone Usage

You can also use the DiffViewer component directly:

```tsx
import { DiffViewer } from '@/components/diff-viewer'

// Option 1: Provide a diff string
<DiffViewer 
  diffContent={gitDiffOutput}
  viewType="unified"
  title="Changes"
  fileName="app.tsx"
/>

// Option 2: Provide old and new content
<DiffViewer 
  oldContent={originalFile}
  newContent={modifiedFile}
  viewType="unified"
  title="File Comparison"
/>
```

## Diff Detection

The system automatically detects diff content using these patterns:

1. Git diff format (`diff --git`)
2. Unified diff format (`--- a/` and `+++ b/`)
3. Hunk headers (`@@ -1,1 +1,1 @@`)
4. SVN diff format
5. Content structure (multiple lines starting with `+` or `-`)

## Customization

### View Types

- `unified` (default): Shows changes inline with context
- `split`: Shows old and new versions side-by-side

### Styling

The component uses custom CSS that integrates with your theme:
- Respects light/dark mode
- Uses your application's color scheme
- Responsive design for mobile viewing

## Examples of Improved Output

### Before (Simple text display):
```
+ Added line
- Removed line
  Context line
```

### After (Rich diff viewer):
- Proper line numbers
- Syntax highlighting
- File headers with statistics
- Expandable sections
- Professional formatting

## Integration Points

The diff viewer enhances output display in:

1. **Git operations** - Shows file changes clearly
2. **Test results** - Displays expected vs actual differences
3. **Code reviews** - Before/after comparisons
4. **File edits** - Track changes made by the AI
5. **Validation checks** - Show configuration differences

## Performance

The DiffViewer is optimized for:
- Large diffs (virtualization for long files)
- Real-time updates (efficient re-rendering)
- Memory usage (lazy loading of diff hunks)