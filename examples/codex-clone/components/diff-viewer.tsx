"use client"

import React from 'react'
import { parseDiff, Diff, Hunk, Decoration, getChangeKey } from 'react-diff-view'
import { diffLines, formatLines, createPatch } from 'diff'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Plus, Minus, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DiffViewerProps {
  oldContent?: string
  newContent?: string
  diffContent?: string
  viewType?: 'unified' | 'split'
  title?: string
  fileName?: string
  className?: string
}

export function DiffViewer({
  oldContent,
  newContent,
  diffContent,
  viewType = 'unified',
  title,
  fileName,
  className
}: DiffViewerProps) {
  // Parse diff content or generate diff from old/new content
  const getDiffText = (): string => {
    if (diffContent) {
      return diffContent
    }
    
    if (oldContent !== undefined && newContent !== undefined) {
      // Create a proper unified diff format
      const oldLines = oldContent.split('\n')
      const newLines = newContent.split('\n')
      
      const header = fileName 
        ? `diff --git a/${fileName} b/${fileName}\nindex 0000000..1111111 100644\n--- a/${fileName}\n+++ b/${fileName}\n`
        : 'diff --git a/file b/file\nindex 0000000..1111111 100644\n--- a/file\n+++ b/file\n'
      
      // Use createPatch from diff library for proper unified diff
      const patch = createPatch(fileName || 'file', oldContent, newContent, 'old', 'new', { context: 3 })
      
      return patch
    }
    
    return ''
  }

  const diffText = getDiffText()
  
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
    // If parsing fails, try to create a simple diff display
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
          <pre className="text-xs font-mono whitespace-pre-wrap break-words overflow-x-auto p-4 bg-muted/50 rounded-md">
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
              <span className="flex items-center gap-1 text-green-600">
                <Plus className="h-3 w-3" />
                {additions}
              </span>
              <span className="flex items-center gap-1 text-red-600">
                <Minus className="h-3 w-3" />
                {deletions}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="diff-view-wrapper">
            <Diff
              viewType={viewType}
              diffType={type}
              hunks={hunks}
              className="custom-diff-view"
              renderToken={(token, defaultRender, i) => {
                // Apply inline styles for tokens
                if (token.type === 'addition') {
                  return (
                    <span key={i} style={{ color: 'rgb(34, 197, 94)' }}>
                      {token.value || token.children}
                    </span>
                  )
                }
                if (token.type === 'deletion') {
                  return (
                    <span key={i} style={{ color: 'rgb(239, 68, 68)' }}>
                      {token.value || token.children}
                    </span>
                  )
                }
                return defaultRender(token, i)
              }}
            >
              {(hunks: any[]) =>
                hunks.map((hunk) => (
                  <Hunk key={hunk.content} hunk={hunk}>
                    {/* Hunk content is rendered automatically */}
                  </Hunk>
                ))
              }
            </Diff>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {files.map(renderFile)}
    </div>
  )
}

// Add custom styles for the diff viewer
const diffViewerStyles = `
  .custom-diff-view {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 12px;
    line-height: 1.5;
    background-color: var(--background);
    color: var(--foreground);
  }

  .custom-diff-view .diff-line {
    padding: 0 10px;
  }

  .custom-diff-view .diff-line-num {
    color: var(--muted-foreground);
    padding: 0 10px;
    text-align: right;
    user-select: none;
    min-width: 40px;
    background-color: var(--muted);
  }

  .custom-diff-view .diff-line-content {
    white-space: pre-wrap;
    word-break: break-all;
  }

  /* Light mode colors */
  .custom-diff-view .diff-line-insert {
    background-color: rgba(34, 197, 94, 0.1);
  }

  .custom-diff-view .diff-line-delete {
    background-color: rgba(239, 68, 68, 0.1);
  }

  .custom-diff-view .diff-line-insert .diff-line-content {
    color: rgb(22, 163, 74);
  }

  .custom-diff-view .diff-line-delete .diff-line-content {
    color: rgb(220, 38, 38);
  }

  .custom-diff-view .diff-gutter {
    background-color: var(--muted);
  }

  .custom-diff-view .diff-hunk-header {
    background-color: var(--muted);
    color: var(--muted-foreground);
    padding: 4px 10px;
    font-size: 11px;
  }

  .diff-view-wrapper {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 0 0 var(--radius) var(--radius);
    background-color: var(--background);
  }

  /* Dark mode adjustments - softer colors */
  .dark .custom-diff-view .diff-line-insert {
    background-color: rgba(34, 197, 94, 0.08);
  }

  .dark .custom-diff-view .diff-line-delete {
    background-color: rgba(239, 68, 68, 0.08);
  }

  .dark .custom-diff-view .diff-line-insert .diff-line-content {
    color: rgb(74, 222, 128);
  }

  .dark .custom-diff-view .diff-line-delete .diff-line-content {
    color: rgb(251, 113, 133);
  }

  /* Ensure the code view doesn't have its own background */
  .custom-diff-view .diff-code-insert,
  .custom-diff-view .diff-code-delete,
  .custom-diff-view .diff-code-normal {
    background: transparent !important;
  }
`

// Inject styles
if (typeof document !== 'undefined') {
  const styleId = 'diff-viewer-styles'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = diffViewerStyles
    document.head.appendChild(style)
  }
}