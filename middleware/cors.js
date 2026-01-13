const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://barefoot-9610.myshopify.com';

function getCorsOrigin(origin) {
  if (!origin) return ALLOWED_ORIGIN;
  const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  const normalizedAllowed = ALLOWED_ORIGIN.endsWith('/') ? ALLOWED_ORIGIN.slice(0, -1) : ALLOWED_ORIGIN;
  
  if (normalizedOrigin.startsWith(normalizedAllowed) || origin.startsWith(ALLOWED_ORIGIN)) {
    return origin;
  }
  
  return ALLOWED_ORIGIN;
}

function setCorsHeaders(res, origin) {
  const corsOrigin = getCorsOrigin(origin);
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function corsMiddleware(req, res, next) {
  setCorsHeaders(res, req.headers.origin);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
}

module.exports = {
  corsMiddleware,
  setCorsHeaders,
  getCorsOrigin
};

