// Install before CORS, body parsing and routes so errors/preflights are covered.
// All responses are no-store: bearer tokens, signed recording URLs and websocket
// capabilities can be issued by several routes, including future routes.
export function installSecurityHeaders(app) {
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  });
}
