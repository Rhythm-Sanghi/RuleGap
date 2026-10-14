import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { SERVER_CONFIG } from './config.js';
import { hostHeaderValidation, csrfProtection } from './middleware/security.js';
import { fixturesRouter } from './routes/fixtures.js';
import { plansRouter } from './routes/plans.js';
import { runsRouter } from './routes/runs.js';
import { runStore } from './storage/runStore.js';
import { browserPool } from './runner/browserPool.js';

export function createApp(): express.Application {
  const app = express();


  // Host header validation
  app.use(hostHeaderValidation);

  // Body parser
  app.use(express.json({ limit: '1mb' }));

  // Anti-CSRF on state-changing requests
  app.use(csrfProtection);

  // API & Fixture Routers
  app.use(fixturesRouter);
  app.use(plansRouter);
  app.use(runsRouter);

  // Serve client assets if built
  const clientDist = path.resolve(process.cwd(), 'dist/client');
  if (!fs.existsSync(clientDist) && process.env.NODE_ENV !== 'production' && !process.env.VITEST) {
    try {
      execSync('npm run build:client', { stdio: 'inherit' });
    } catch {
      // Ignore if build cannot be run synchronously
    }
  }

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

export const createServer = createApp;

export async function startServer(port: number = SERVER_CONFIG.port): Promise<http.Server> {
  // Reconcile any abandoned active runs from previous crashes
  await runStore.reconcileStartupCrashes().catch((err) => {
    console.error('[RuleGap Server] Crash reconciliation error:', err);
  });

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

if (process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'))) {
  startServer();
}
