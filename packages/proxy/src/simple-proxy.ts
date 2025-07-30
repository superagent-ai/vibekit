import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import redactSecrets from "redact-secrets";

const app = express();
const PORT = 3000;
const TARGET = "https://api.anthropic.com";

console.log(`🛡️ Simple Redacting Proxy`);
console.log(`   Target: ${TARGET}`);
console.log(`   Port: ${PORT}`);

// Test redact-secrets to make sure it works
const testText = "Test secret detection";
console.log(`🧪 Testing redact-secrets package...`);
console.log(`🧪 Package type:`, typeof redactSecrets);

// Try different ways to call it
let testRedacted;
try {
  testRedacted = redactSecrets(testText);
  console.log(`✅ Method 1 worked:`, testRedacted);
} catch (e) {
  console.log(`❌ Method 1 failed:`, e.message);
  try {
    testRedacted = redactSecrets.redact(testText);
    console.log(`✅ Method 2 worked:`, testRedacted);
  } catch (e2) {
    console.log(`❌ Method 2 failed:`, e2.message);
    testRedacted = testText; // fallback
  }
}

const proxy = createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  selfHandleResponse: true,
  onProxyReq: (proxyReq, req, res) => {
    console.log(`\n🔗 ${req.method} ${req.url}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(
      `📤 Response: ${proxyRes.statusCode} ${proxyRes.headers["content-type"]}`
    );

    // Set headers
    Object.keys(proxyRes.headers).forEach((key) => {
      res.setHeader(key, proxyRes.headers[key]);
    });
    res.status(proxyRes.statusCode || 200);

    let body = "";

    proxyRes.on("data", (chunk) => {
      body += chunk.toString();
    });

    proxyRes.on("end", () => {
      console.log(`📦 Body length: ${body.length}`);
      console.log(`📦 Body preview: ${body.substring(0, 200)}...`);

      // Apply redaction
      const redactedBody = redactSecrets(body);

      console.log(`🔒 Redacted length: ${redactedBody.length}`);
      console.log(`🔒 Changes made: ${body !== redactedBody}`);

      res.send(redactedBody);
    });
  },
});

app.use("/", proxy);

app.listen(PORT, () => {
  console.log(`\n✅ Proxy running on http://localhost:${PORT}`);
  console.log(`   Try: export ANTHROPIC_BASE_URL="http://localhost:${PORT}"`);
});
