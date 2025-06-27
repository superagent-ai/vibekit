"use client"

import { DiffViewerV2 } from '@/components/diff-viewer-v2'

export default function TestDiffPage() {
  const sampleGitDiff = `diff --git a/src/app.tsx b/src/app.tsx
index 1234567..abcdefg 100644
--- a/src/app.tsx
+++ b/src/app.tsx
@@ -10,7 +10,7 @@ export function App() {
   return (
     <div className="app">
-      <h1>Hello World</h1>
+      <h1>Hello React Diff View!</h1>
       <p>This is a test application</p>
-      <button>Click me</button>
+      <button onClick={() => alert('Clicked!')}>Click me</button>
     </div>
   )
 }`

  const oldContent = `export function App() {
  return (
    <div className="app">
      <h1>Hello World</h1>
      <p>This is a test application</p>
      <button>Click me</button>
    </div>
  )
}`

  const newContent = `export function App() {
  return (
    <div className="app">
      <h1>Hello React Diff View!</h1>
      <p>This is a test application</p>
      <button onClick={() => alert('Clicked!')}>Click me</button>
    </div>
  )
}`

  return (
    <div className="container mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold mb-4">Diff Viewer Test Page</h1>
      
      <section>
        <h2 className="text-xl font-semibold mb-2">Test 1: Git Diff Format (Unified View)</h2>
        <DiffViewerV2 
          diffContent={sampleGitDiff}
          viewType="unified"
          title="Sample Git Diff"
          fileName="src/app.tsx"
        />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Test 2: Old vs New Content (Split View)</h2>
        <DiffViewerV2 
          oldContent={oldContent}
          newContent={newContent}
          viewType="unified"
          title="Before and After Comparison"
          fileName="app.tsx"
        />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Test 3: Simple Diff Lines</h2>
        <DiffViewerV2 
          diffContent={`--- a/test.txt
+++ b/test.txt
@@ -1,3 +1,3 @@
 Line 1
-Line 2 old
+Line 2 new
 Line 3`}
          viewType="unified"
          title="Simple Text Diff"
        />
      </section>
    </div>
  )
}