const config = require('./config.js');
const fetch = require('node-fetch');

class Logger {
  constructor() {
    // Check if running in test environment
    this.enabled = process.env.NODE_ENV !== 'test';
  }

  // HTTP request logging middleware
  httpLogger = (req, res, next) => {
    // Store original send method
    const originalSend = res.send;
    
    // Override send method to capture response data
    res.send = function(body) {
      // Get response body (might be a string or object)
      let responseBody = body;
      if (typeof body !== 'string') {
        responseBody = JSON.stringify(body);
      }
      
      // Create log data object
      const logData = {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        authorized: !!req.headers.authorization,
        reqBody: this.sanitize(req.body),
        resBody: this.sanitize(responseBody)
      };
      
      // Determine log level based on status code
      const level = this.statusToLogLevel(res.statusCode);
      
      // Log the HTTP request
      this.sendLogToGrafana('http', level, logData);
      
      // Restore original send method and call it
      res.send = originalSend;
      return res.send(body);
    }.bind(this);
    
    next();
  };
  
  // Log database queries
  dbLogger = (sql, params) => {
    const logData = {
      query: sql,
      params: this.sanitize(params)
    };
    
    this.sendLogToGrafana('database', 'info', logData);
  };
  
  // Log factory service requests
  factoryLogger = (method, url, requestBody, status, responseBody) => {
    const logData = {
      method,
      url,
      requestBody: this.sanitize(requestBody),
      statusCode: status,
      responseBody: this.sanitize(responseBody)
    };
    
    this.sendLogToGrafana('factory', 'info', logData);
  };
  
  // Log unhandled exceptions
  errorLogger = (err) => {
    const logData = {
      message: err.message,
      stack: err.stack
    };
    
    this.sendLogToGrafana('exception', 'error', logData);
  };
  
  // Helper method to map HTTP status codes to log levels
  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }
  
  // Sanitize sensitive data
  sanitize(data) {
    if (!data) return data;
    
    // Make a deep copy to avoid modifying the original
    let sanitized;
    
    if (typeof data === 'object') {
      // Handle objects (including arrays)
      sanitized = JSON.parse(JSON.stringify(data));
      
      // Remove sensitive information
      if (sanitized.password) {
        sanitized.password = '****';
      }
      
      if (typeof sanitized === 'object' && !Array.isArray(sanitized)) {
        // Recursively sanitize nested objects
        for (const key in sanitized) {
          if (typeof sanitized[key] === 'object') {
            sanitized[key] = this.sanitize(sanitized[key]);
          } else if (key === 'password' || key.includes('password')) {
            sanitized[key] = '****';
          } else if (key === 'token' || key.includes('token')) {
            sanitized[key] = '****';
          }
        }
      }
    } else if (typeof data === 'string') {
      // Try to parse as JSON to sanitize
      try {
        const obj = JSON.parse(data);
        sanitized = JSON.stringify(this.sanitize(obj));
      } catch (e) {
        // Not valid JSON, do a basic regex replacement for passwords
        sanitized = data.replace(/["']password["']\s*:\s*["'][^"']*["']/g, '"password":"****"');
      }
    } else {
      // For other types, just return as is
      sanitized = data;
    }
    
    return sanitized;
  }
  
  // Send log to Grafana Loki - following the pattern of your metrics implementation
  sendLogToGrafana(type, level, logData) {
    // Skip if running in test environment
    if (!this.enabled) {
      return Promise.resolve();
    }

    // Check if logging config exists
    if (!config.logging) {
      console.warn('Logging configuration is missing. Skipping log send.');
      return Promise.resolve();
    }

    // Format timestamp
    const timestamp = (Date.now() * 1000000).toString();
    
    // Format log message
    const logMessage = JSON.stringify(logData);
    
    // Create stream labels
    const streamLabels = {
      component: config.logging.source,
      level: level,
      type: type
    };
    
    // Build the Loki-compatible log event
    const logEvent = {
      streams: [{
        stream: streamLabels,
        values: [
          [timestamp, logMessage]
        ]
      }]
    };
    
    console.log(`Sending log: type=${type}, level=${level}`);
    
    return fetch(config.logging.url, {
      method: 'post',
      body: JSON.stringify(logEvent),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.logging.userId}:${config.logging.apiKey}`
      }
    })
    .then((response) => {
      if (!response.ok) {
        return response.text().then((text) => {
          console.error(`Failed to push log data to Grafana: ${text}`);
        });
      } else {
        console.log(`Successfully sent log: type=${type}, level=${level}`);
      }
    })
    .catch((error) => {
      console.error('Error pushing log:', error);
    });
  }
  
  // Generic log method that other components can use directly
  log(level, type, message) {
    this.sendLogToGrafana(type, level, {message: message});
  }
}

module.exports = new Logger();