const config = require('./config.js');
const fetch = require('node-fetch');

class Logger {
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
      this.log(level, 'http', logData);
      
      // Restore original send method and call it
      res.send = originalSend;
      return res.send(body);
    }.bind(this);
    
    next();
  };
  
  // Log database queries
  dbLogger = (sql, params) => {
    this.log('info', 'database', {
      query: sql,
      params: this.sanitize(params)
    });
  };
  
  // Log factory service requests
  factoryLogger = (method, url, requestBody, status, responseBody) => {
    this.log('info', 'factory', {
      method,
      url,
      requestBody: this.sanitize(requestBody),
      statusCode: status,
      responseBody: this.sanitize(responseBody)
    });
  };
  
  // Log unhandled exceptions
  errorLogger = (err) => {
    this.log('error', 'exception', {
      message: err.message,
      stack: err.stack
    });
  };
  
  // Generic logging function
  log(level, type, data) {
    // Create labels for this log event
    const labels = {
      component: config.logging.source,
      level,
      type
    };
    
    // Create values for this log event - THIS IS THE KEY FIX
    // Loki expects values to be an array of arrays, where each inner array is [timestamp, message]
    const values = [
      [this.nowString(), JSON.stringify(data)]
    ];
    
    // Build the Loki-compatible log event
    const logEvent = {
      streams: [{
        stream: labels,
        values: values  // Now properly formatted for Loki
      }]
    };
    
    // Send the log event to Grafana Loki
    this.sendLogToGrafana(logEvent);
  }
  
  // Helper method to map HTTP status codes to log levels
  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }
  
  // Generate timestamp in nanoseconds (Loki format)
  nowString() {
    return (Date.now() * 1000000).toString();
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
  
  // Send log to Grafana Loki
  sendLogToGrafana(event) {
    const body = JSON.stringify(event);
    
    fetch(config.logging.url, {
      method: 'post',
      body,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.logging.userId}:${config.logging.apiKey}`
      }
    }).catch(err => {
      console.error('Failed to send log to Grafana:', err.message);
    });
  }
}

module.exports = new Logger();