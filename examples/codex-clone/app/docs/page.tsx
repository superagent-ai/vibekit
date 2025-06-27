export default function DocsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-4">Documentation</h1>
      <p className="text-muted-foreground mb-8">
        Learn how to use codex-clone to build AI-powered applications.
      </p>
      
      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold mb-3">Getting Started</h2>
          <p className="text-muted-foreground">
            Documentation content coming soon...
          </p>
        </section>
        
        <section>
          <h2 className="text-2xl font-semibold mb-3">API Reference</h2>
          <p className="text-muted-foreground">
            Detailed API documentation will be available here.
          </p>
        </section>
        
        <section>
          <h2 className="text-2xl font-semibold mb-3">Examples</h2>
          <p className="text-muted-foreground">
            Browse through example implementations and use cases.
          </p>
        </section>
      </div>
    </div>
  );
}