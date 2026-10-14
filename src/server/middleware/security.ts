import { Request, Response, NextFunction } from 'express';
import { SERVER_CONFIG } from '../config.js';

/**
 * Validates Host header to ensure requests are directed strictly to local address.
 */
export function hostHeaderValidation(req: Request, res: Response, next: NextFunction): void {
  const host = req.headers.host;
  const allowed = [
    `127.0.0.1:${SERVER_CONFIG.port}`,
    `localhost:${SERVER_CONFIG.port}`,
  ];

  if (!host) {
    res.status(403).json({ error: 'Forbidden: Missing Host header' });
    return;
  }

  // Allow dynamic test ports on 127.0.0.1 or localhost
  const isLocalHost = host.startsWith('127.0.0.1:') || host.startsWith('localhost:');
  if (!isLocalHost && !allowed.includes(host)) {
    res.status(403).json({ error: `Forbidden: Untrusted Host header '${host}'` });
    return;
  }

  next();
}

/**
 * Anti-CSRF protection: Enforces custom client header on all state-changing POST requests.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'POST') {
    const clientHeader = req.headers['x-rulegap-client'];
    if (clientHeader !== 'true') {
      res.status(403).json({
        error: 'Forbidden: Missing or invalid X-RuleGap-Client header for state-changing request',
      });
      return;
    }
  }
  next();
}
