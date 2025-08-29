#!/usr/bin/env node

/**
 * Custom static server optimized for iframe embedding
 * Addresses Firefox iframe security restrictions
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'font/eot'
};

function createServer(rootDir, port, host = '127.0.0.1') {
  const server = http.createServer((req, res) => {
    // Parse URL
    const parsedUrl = url.parse(req.url);
    let pathname = `.${parsedUrl.pathname}`;
    
    // Default to index.html for directory requests
    if (pathname === './') {
      pathname = './index.html';
    }
    
    // Resolve full path
    const fullPath = path.resolve(rootDir, pathname);
    
    // Security check - ensure we're serving from within rootDir
    if (!fullPath.startsWith(path.resolve(rootDir))) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    
    // Set CORS and iframe-friendly headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // CRITICAL: Allow iframe embedding
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' http://localhost:* http://127.0.0.1:*");
    
    // Cache control for development
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      res.statusCode = 200;
      res.end();
      return;
    }
    
    // Check if file exists
    fs.access(fullPath, fs.constants.F_OK, (err) => {
      if (err) {
        // Try index.html for SPA routing
        const indexPath = path.join(rootDir, 'index.html');
        fs.access(indexPath, fs.constants.F_OK, (indexErr) => {
          if (indexErr) {
            res.statusCode = 404;
            res.end('404 Not Found');
          } else {
            serveFile(indexPath, res);
          }
        });
      } else {
        // Check if it's a directory
        fs.stat(fullPath, (statErr, stats) => {
          if (statErr) {
            res.statusCode = 500;
            res.end('Internal Server Error');
          } else if (stats.isDirectory()) {
            const indexPath = path.join(fullPath, 'index.html');
            fs.access(indexPath, fs.constants.F_OK, (indexErr) => {
              if (indexErr) {
                res.statusCode = 404;
                res.end('Directory listing not allowed');
              } else {
                serveFile(indexPath, res);
              }
            });
          } else {
            serveFile(fullPath, res);
          }
        });
      }
    });
  });
  
  function serveFile(filePath, res) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    
    stream.on('error', (err) => {
      res.statusCode = 500;
      res.end('Error reading file');
    });
  }
  
  server.listen(port, host, () => {
    console.log(`Static server running at http://${host}:${port}/`);
    console.log(`Serving files from: ${path.resolve(rootDir)}`);
    console.log('Optimized for iframe embedding');
  });
  
  return server;
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const rootDir = args[0] || '.';
  const port = parseInt(args[1]) || 8080;
  const host = args[2] || '127.0.0.1';
  
  createServer(rootDir, port, host);
}

export { createServer };