const express = require('express');
const rateLimit = require('express-rate-limit');
const { authRouter, setAuthUser } = require('./routes/authRouter.js');
const orderRouter = require('./routes/orderRouter.js');
const franchiseRouter = require('./routes/franchiseRouter.js');
const version = require('./version.json');
const config = require('./config.js');
const { metrics, requestTracker, startMetricsReporting } = require('./metrics.js');
const logger = require('./logger.js');

const app = express();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

app.use(express.json());
app.use(setAuthUser);

app.use(logger.httpLogger);
app.use(requestTracker);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

const apiRouter = express.Router();
app.use('/api', apiRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/order', orderRouter);
apiRouter.use('/franchise', franchiseRouter);

apiRouter.use('/docs', (req, res) => {
  res.json({
    version: version.version,
    endpoints: [...authRouter.endpoints, ...orderRouter.endpoints, ...franchiseRouter.endpoints],
    config: { factory: config.factory.url, db: config.db.connection.host },
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'welcome to JWT Pizza',
    version: version.version,
  });
});

// Special route to immediately reject suspicious Git-related paths
app.use('/shop/git', (req, res) => {
  res.status(403).json({
    message: 'Access forbidden'
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    message: 'unknown endpoint',
  });
});

app.use((err, req, res, next) => {
  logger.errorLogger(err);
  
  res.status(err.statusCode ?? 500).json({
    message: err.message,
    stack: err.stack
  });
  
  next();
});

let metricsReporter;
app.on('ready', () => {
  console.log('Starting metrics reporting');
  metricsReporter = startMetricsReporting();
});

process.on('SIGTERM', () => {
  console.log('Stopping metrics reporting');
  metrics.stopMetricsReporting();
});

module.exports = app;