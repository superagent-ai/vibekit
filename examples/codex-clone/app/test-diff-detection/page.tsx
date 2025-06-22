"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DiffViewerV2 } from "@/components/diff-viewer-v2"

// Copy the isDiffContent function from task-timeline.tsx for testing
const isDiffContent = (content: string): boolean => {
  // More aggressive logging for debugging
  console.log('[DiffDetection] Checking content:', {
    length: content.length,
    firstLine: content.split('\n')[0],
    hasGitDiff: /^diff --git/m.test(content),
    hasUnifiedDiff: /^--- /m.test(content) && /^\+\+\+ /m.test(content),
    sample: content.substring(0, 300)
  })
  
  // Check for common diff patterns
  const diffPatterns = [
    /^diff --git/m,  // Git diff
    /^--- /m,     // Unified diff (removed a/ requirement)
    /^\+\+\+ /m,  // Unified diff (removed b/ requirement)
    /^@@\s+-\d+,\d+\s+\+\d+,\d+\s+@@/m,  // Hunk header
    /^Index: /m,     // SVN diff
    /^===================================================================$/m,  // SVN separator
  ]
  
  // Check if content has diff-like structure (multiple lines with +/- at start)
  const lines = content.split('\n')
  const diffLineCount = lines.filter(line => /^[+-]/.test(line)).length
  const hasDiffStructure = diffLineCount > 3 && (diffLineCount / lines.length) > 0.2
  
  // Also check for git diff command output
  const isGitDiffOutput = content.includes('diff --git') || 
                         (content.includes('---') && content.includes('+++')) ||
                         content.includes('@@')
  
  const result = diffPatterns.some(pattern => pattern.test(content)) || hasDiffStructure || isGitDiffOutput
  console.log('[DiffDetection] Result:', result)
  
  return result
}

export default function TestDiffDetectionPage() {
  const [testContent, setTestContent] = useState(`diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 This is line 1
-This is the old line 2
+This is the new line 2
 This is line 3`)

  const [customContent, setCustomContent] = useState("")

  const testCases = [
    {
      name: "Git diff format",
      content: `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 This is line 1
-This is the old line 2
+This is the new line 2
 This is line 3`
    },
    {
      name: "Unified diff format",
      content: `--- file.txt
+++ file.txt
@@ -1,3 +1,3 @@
 This is line 1
-This is the old line 2
+This is the new line 2
 This is line 3`
    },
    {
      name: "Simple diff lines",
      content: `- Old line 1
- Old line 2
+ New line 1
+ New line 2
+ New line 3`
    },
    {
      name: "Mixed content with diff",
      content: `Running git diff...

diff --git a/src/app.js b/src/app.js
index 123..456 789
--- a/src/app.js
+++ b/src/app.js
@@ -10,7 +10,7 @@
 function main() {
-  console.log('old')
+  console.log('new')
 }`
    }
  ]

  return (
    <div className="container mx-auto p-8 space-y-8">
      <h1 className="text-3xl font-bold">Diff Detection Test Page</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Test Predefined Cases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {testCases.map((testCase, index) => (
            <div key={index} className="space-y-2">
              <h3 className="font-semibold">{testCase.name}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm text-muted-foreground mb-2">Content:</h4>
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-40">
                    {testCase.content}
                  </pre>
                </div>
                <div>
                  <h4 className="text-sm text-muted-foreground mb-2">Detection Result:</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Is Diff:</span>
                      <span className={`font-semibold ${isDiffContent(testCase.content) ? 'text-green-600' : 'text-red-600'}`}>
                        {isDiffContent(testCase.content) ? 'YES' : 'NO'}
                      </span>
                    </div>
                    {isDiffContent(testCase.content) && (
                      <div className="mt-4">
                        <h4 className="text-sm text-muted-foreground mb-2">Rendered Diff:</h4>
                        <DiffViewerV2 diffContent={testCase.content} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test Custom Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            value={customContent}
            onChange={(e) => setCustomContent(e.target.value)}
            className="w-full h-40 p-3 border rounded font-mono text-sm"
            placeholder="Paste your content here to test diff detection..."
          />
          <Button onClick={() => setTestContent(customContent)}>
            Test Detection
          </Button>
          {customContent && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">Is Diff:</span>
                <span className={`font-semibold ${isDiffContent(customContent) ? 'text-green-600' : 'text-red-600'}`}>
                  {isDiffContent(customContent) ? 'YES' : 'NO'}
                </span>
              </div>
              {isDiffContent(customContent) && (
                <div className="mt-4">
                  <h4 className="text-sm text-muted-foreground mb-2">Rendered Diff:</h4>
                  <DiffViewerV2 diffContent={customContent} />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Console Output</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Check your browser console for detailed debug logs from the isDiffContent function.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}