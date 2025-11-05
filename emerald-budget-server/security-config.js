// Security Configuration Module
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Environment defaults with secure fallbacks
const config = {
  jwt: {
    secret: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
    refreshSecret: process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex'),
    accessTokenExpiry: '1h',
    refreshTokenExpiry: '7d',
    algorithm: 'HS256'
  },
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS) || 14
  },
  session: {
    secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
    maxAge: 30 * 60 * 1000, // 30 minutes idle timeout
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  },
  rateLimit: {
    auth: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
      max: parseInt(process.env.RATE_LIMIT_MAX_AUTH) || 20,
      message: 'Too many authentication attempts. Please try again in 1 minute.',
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false
    },
    general: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
      max: process.env.NODE_ENV === 'development' ? 10000 : (parseInt(process.env.RATE_LIMIT_MAX_GENERAL) || 1000), // Much higher for dev
      message: 'Too many requests. Please slow down.',
      standardHeaders: true,
      legacyHeaders: false
    }
  },
  cors: {
    origin: function(origin, callback) {
      const allowedOrigins = [
        process.env.CLIENT_URL || 'http://localhost:3001',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://[::]:8080',
        'https://emerald-budget.com',
        'https://app.emerald-budget.com',
        'https://evercash.in',
        'https://app.evercash.in'
      ];
      
      // Allow requests with no origin (like mobile apps)
      if (!origin) return callback(null, true);
      
      // In development, allow all origins to simplify mobile/ngrok testing
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Country-Code'],
    exposedHeaders: ['X-CSRF-Token']
  }
};

// Token generation utilities
const generateTokens = (userId, email) => {
  const payload = { userId, email };
  
  const accessToken = jwt.sign(
    payload,
    config.jwt.secret,
    {
      expiresIn: config.jwt.accessTokenExpiry,
      algorithm: config.jwt.algorithm
    }
  );
  
  const refreshToken = jwt.sign(
    payload,
    config.jwt.refreshSecret,
    {
      expiresIn: config.jwt.refreshTokenExpiry,
      algorithm: config.jwt.algorithm
    }
  );
  
  return { accessToken, refreshToken };
};

// Token verification
const verifyToken = (token, isRefresh = false) => {
  try {
    const secret = isRefresh ? config.jwt.refreshSecret : config.jwt.secret;
    return jwt.verify(token, secret, { algorithms: [config.jwt.algorithm] });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw error;
  }
};

// Password hashing
const hashPassword = async (password) => {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  return bcrypt.hash(password, config.bcrypt.rounds);
};

// Password verification
const verifyPassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

// Generate CSP nonce
const generateNonce = () => {
  return crypto.randomBytes(16).toString('base64');
};

// CSP configuration generator
const getCSPConfig = (nonce) => {
  const directives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", `'nonce-${nonce}'`],
    styleSrc: ["'self'", `'nonce-${nonce}'`, 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    connectSrc: [
      "'self'",
      process.env.LOCAL_API_URL || 'http://localhost:5006',
      process.env.PROD_API_URL || 'https://api.emerald-budget.com',
      'https://plaid.com',
      'https://cdn.plaid.com'
    ],
    mediaSrc: ["'none'"],
    objectSrc: ["'none'"],
    childSrc: ["'self'"],
    workerSrc: ["'self'", 'blob:'],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    manifestSrc: ["'self'"],
    ...(process.env.NODE_ENV === 'production' && {
      upgradeInsecureRequests: [],
      blockAllMixedContent: []
    })
  };
  
  return directives;
};

// Session token generator
const generateSessionToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// HTTPS redirect middleware for production
const httpsRedirect = (req, res, next) => {
  if (req.path === '/health') {
    return next();
  }
  const xfProto = req.header('x-forwarded-proto');
  if (process.env.NODE_ENV === 'production' && xfProto && xfProto !== 'https') {
    return res.redirect(`https://${req.header('host')}${req.url}`);
  }
  next();
};

module.exports = {
  config,
  generateTokens,
  verifyToken,
  hashPassword,
  verifyPassword,
  generateNonce,
  getCSPConfig,
  generateSessionToken,
  httpsRedirect
};
