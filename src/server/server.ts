import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { SERVER_CONFIG } from './config.js';
import { fixturesRouter } from './routes/fixtures.js';
import { browserPool } from './runner/browserPool.js';

export function createApp(): express.Application {
  const app = express();

  // Basic security middleware: reject invalid host headers
  app.use((req, res, next) => {
    const host = req.headers.host;
    const allowedHosts = [`127.0.0.1:${SERVER_CONFIG.port}`, `localhost:${SERVER_CONFIG.port}`];
    if (host && !allowedHosts.includes(host) && !host.startsWith('127.0.0.1:') && !host.startsWith('localhost:')) {
      return res.status(403).json({ error: 'Forbidden: untrusted Host header' });
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  // Mount fixture routes
  app.use(fixturesRouter);

  // Serve client assets if built, or placeholder if in dev before full build
  const clientDist = path.resolve(process.cwd(), 'dist/client');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/fixtures')) {
        return next();
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return app;
}

export function startServer(port: number = SERVER_CONFIG.port): Promise<http.Server> {
  const app = createApp();
  const server = http.createServer(app);

  return new Promise((resolve) => {
    server.listen(port, SERVER_CONFIG.host, () => {
      console.log(`[RuleGap Server] Running on http://${SERVER_CONFIG.host}:${port}`);
      resolve(server);
    });
  });
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('[RuleGap Server] Shutting down...');
  await browserPool.close();
  process.exit(0);
});

// Run directly if invoked via node/tsx
if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  startServer();
}
