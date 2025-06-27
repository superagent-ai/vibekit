"use client"

import React from 'react'
import { parseDiff, Diff, Hunk } from 'react-diff-view'
import { createPatch } from 'diff'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Plus, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'

interface DiffViewerProps {
  oldContent?: string
  newContent?: string
  diffContent?: string
  viewType?: 'unified' | 'split'
  title?: string
  fileName?: string
  className?: string
}

export function DiffViewerV2({
  oldContent,
  newContent,
  diffContent,
  viewType = 'unified',
  title,
  fileName,
  className
}: DiffViewerProps) {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  
  React.useEffect(() => {
    setMounted(true)
  }, [])
  
  // Use resolvedTheme for accurate theme detection
  const isDark = mounted ? (resolvedTheme || theme) === 'dark' : false

  // Color schemes for light and dark modes
  const colors = React.useMemo(() => ({
    addition: isDark ? '#22c55e' : '#16a34a',
    deletion: isDark ? '#ef4444' : '#dc2626',
    additionBg: isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
    deletionBg: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
    gutterBg: isDark ? '#18181b' : '#f4f4f5',
    gutterText: isDark ? '#a1a1aa' : '#71717a',
    normalText: isDark ? '#e4e4e7' : '#27272a',
    codeBg: isDark ? '#0a0a0a' : '#ffffff',
    borderColor: isDark ? '#27272a' : '#e4e4e7'
  }), [isDark])

  // Parse diff content or generate diff from old/new content
  const getDiffText = (): string => {
    if (diffContent) {
      return diffContent
    }
    
    if (oldContent !== undefined && newContent !== undefined) {
      const patch = createPatch(fileName || 'file', oldContent, newContent, 'old', 'new', { context: 3 })
      return patch
    }
    
    return ''
  }

  const diffText = getDiffText()
  
  // Show loading state while theme is being determined
  if (!mounted) {
    return (
      <Card className={cn("w-full animate-pulse", className)}>
        <CardContent className="py-8">
          <div className="h-32 bg-muted rounded" />
        </CardContent>
      </Card>
    )
  }
  
  if (!diffText) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="py-8 text-center text-muted-foreground">
          No diff content to display
        </CardContent>
      </Card>
    )
  }

  let files
  try {
    files = parseDiff(diffText)
  } catch (error) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader className="pb-3">
          {title && <CardTitle className="text-lg">{title}</CardTitle>}
          {fileName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>{fileName}</span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all overflow-x-auto p-4 bg-muted/50 rounded-md max-w-full">
            {diffText}
          </pre>
        </CardContent>
      </Card>
    )
  }

  const renderFile = ({ oldRevision, newRevision, type, hunks, oldPath, newPath }: any) => {
    const filePath = newPath || oldPath
    
    // Calculate stats
    let additions = 0
    let deletions = 0
    hunks.forEach((hunk: any) => {
      hunk.changes.forEach((change: any) => {
        if (change.type === 'insert') additions++
        if (change.type === 'delete') deletions++
      })
    })

    return (
      <Card key={`${oldRevision}-${newRevision}`} className={cn("w-full", className)}>
        <CardHeader className="pb-3">
          {title && <CardTitle className="text-lg">{title}</CardTitle>}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{filePath}</span>
              {type === 'add' && <Badge variant="outline" className="text-green-600">New file</Badge>}
              {type === 'delete' && <Badge variant="outline" className="text-red-600">Deleted</Badge>}
              {type === 'rename' && <Badge variant="outline" className="text-blue-600">Renamed</Badge>}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1" style={{ color: colors.addition }}>
                <Plus className="h-3 w-3" />
                {additions}
              </span>
              <span className="flex items-center gap-1" style={{ color: colors.deletion }}>
                <Minus className="h-3 w-3" />
                {deletions}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div 
            className={cn(
              "overflow-x-auto border rounded-b-lg",
              "bg-white dark:bg-zinc-950",
              "border-gray-200 dark:border-zinc-800"
            )}
            style={{ 
              backgroundColor: colors.codeBg,
              borderColor: colors.borderColor
            }}
          >
            <Diff
              viewType={viewType}
              diffType={type}
              hunks={hunks}
              optimizeSelection={false}
              renderGutter={({ change, side }: any) => {
                const lineNumber = change ? (side === 'old' ? change.oldLineNumber : change.newLineNumber) : null
                return (
                  <td 
                    className={cn(
                      "diff-gutter",
                      "bg-gray-100 dark:bg-zinc-900",
                      "text-gray-500 dark:text-gray-400"
                    )}
                    style={{ 
                      backgroundColor: colors.gutterBg,
                      color: colors.gutterText,
                      padding: '0 8px',
                      minWidth: '50px',
                      textAlign: 'right',
                      userSelect: 'none',
                      fontFamily: 'monospace',
                      fontSize: '12px'
                    }}
                  >
                    {lineNumber}
                  </td>
                )
              }}
            >
              {(hunks: any[]) =>
                hunks.map((hunk) => (
                  <Hunk 
                    key={hunk.content} 
                    hunk={hunk}
                    gutterEvents={{}}
                    widgets={{}}
                  />
                ))
              }
            </Diff>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Apply custom styles
  React.useEffect(() => {
    const styleId = `diff-viewer-v2-styles-${isDark ? 'dark' : 'light'}`
    
    // Remove any existing style elements
    const existingStyles = document.querySelectorAll('[id^="diff-viewer-v2-styles"]')
    existingStyles.forEach(style => style.remove())
    
    if (typeof document !== 'undefined' && mounted) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        .diff-view {
          background-color: ${colors.codeBg};
        }
        
        .diff-view .diff-line {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
          font-size: 12px;
          line-height: 1.5;
        }
        
        .diff-view .diff-code {
          padding: 0 10px;
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-wrap: break-word;
          tab-size: 4;
          max-width: 100%;
        }
        
        .diff-view .diff-line.diff-line-additions {
          background-color: ${colors.additionBg};
        }
        
        .diff-view .diff-line.diff-line-additions .diff-code {
          color: ${colors.addition};
        }
        
        .diff-view .diff-line.diff-line-deletions {
          background-color: ${colors.deletionBg};
        }
        
        .diff-view .diff-line.diff-line-deletions .diff-code {
          color: ${colors.deletion};
        }
        
        .diff-view .diff-line.diff-line-normal .diff-code {
          color: ${colors.normalText};
          background-color: ${colors.codeBg};
        }
        
        .diff-view .diff-hunk-header {
          background-color: ${colors.gutterBg};
          color: ${colors.gutterText};
          padding: 4px 10px;
          font-size: 11px;
          font-family: monospace;
          border-top: 1px solid ${colors.borderColor};
          border-bottom: 1px solid ${colors.borderColor};
        }
        
        .diff-view table {
          border-collapse: collapse;
          width: 100%;
        }
        
        .diff-view td {
          border: none;
        }
      `
      document.head.appendChild(style)
    }
    
    return () => {
      // Cleanup all diff viewer styles on unmount
      const allStyles = document.querySelectorAll('[id^="diff-viewer-v2-styles"]')
      allStyles.forEach(style => style.remove())
    }
  }, [colors, isDark, mounted])

  return (
    <div className="space-y-4">
      {files.map(renderFile)}
    </div>
  )
}