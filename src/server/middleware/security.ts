import { Request, Response, NextFunction } from 'express';

/**
 * Validates Host header to ensure requests are directed strictly to local address.
 */
export function hostHeaderValidation(req: Request, res: Response, next: NextFunction): void {
  const host = req.headers.host;

  if (!host) {
    res.status(403).json({ error: 'Forbidden: Missing Host header' });
    return;
  }

  try {
    // Parse complete hostname and port strictly without relying on substring prefixes
    const parsed = new URL(`http://${host}`);
    const hostname = parsed.hostname;
    const port = parsed.port ? Number(parsed.port) : 80;

    const isAllowedHost =
      hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
    const isValidPort = Number.isInteger(port) && port >= 1 && port <= 65535;

    if (!isAllowedHost || !isValidPort) {
      res.status(403).json({ error: `Forbidden: Untrusted Host header '${host}'` });
      return;
    }
  } catch {
    res.status(403).json({ error: `Forbidden: Malformed Host header '${host}'` });
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
