const logger = require('../utils/logger');

function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  if (status >= 500) {
    logger.error(`${status} - ${message}`, { stack: err.stack });
  } else {
    logger.warn(`${status} - ${message}`);
  }

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
