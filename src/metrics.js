const config = require('./config');
const os = require('os');
const https = require('https');
const url = require('url');

class MetricBuilder {
  constructor() {
    this.lines = [];
    this.timestamp = Date.now() * 1000000; // nanoseconds
  }

  addMetric(name, tags, value) {
    const tagString = Object.entries(tags)
      .map(([key, val]) => `${key}=${val}`)
      .join(',');
    
    // Check if config.metrics exists before trying to access source
    const source = config.metrics?.source || 'test-environment';
    
    this.lines.push(`${name},source=${source}${tagString ? ',' + tagString : ''} value=${value} ${this.timestamp}`);
    return this;
  }

  toString(delimiter = '\n') {
    return this.lines.join(delimiter);
  }
}

class Metrics {
  constructor() {
    // Initialize counters and tracking data
    this.httpRequests = {
      total: 0,
      get: 0,
      post: 0,
      put: 0,
      delete: 0
    };
    
    this.auth = {
      successful: 0,
      failed: 0
    };
    
    this.activeUsers = new Set(); // Store unique user IDs
    
    this.pizzas = {
      sold: 0,
      failures: 0,
      revenue: 0
    };
    
    this.latency = {
      service: [], // Array to store service endpoint latencies
      pizzaCreation: [] // Array to store pizza creation latencies
    };
    
    // Only start periodic reporting if not in test environment
    if (process.env.NODE_ENV !== 'test' && config.metrics) {
      this.startPeriodicReporting(60000);
    }
    
    // Bind methods that will be used as middleware
    this.requestTracker = this.requestTracker.bind(this);
  }
  
  // Middleware to track HTTP requests
  requestTracker(req, res, next) {
    // Track request time for latency calculation
    req.requestStartTime = Date.now();
    
    // Increment total requests
    this.httpRequests.total++;
    
    // Increment by method
    const method = req.method.toLowerCase();
    if (this.httpRequests[method] !== undefined) {
      this.httpRequests[method]++;
    }
    
    // Track response for latency
    const originalSend = res.send;
    res.send = (...args) => {
      // Calculate service latency
      const latency = Date.now() - req.requestStartTime;
      this.latency.service.push(latency);
      
      // If user is authenticated, track as active user
      if (req.user && req.user.id) {
        this.activeUsers.add(req.user.id);
      }
      
      return originalSend.apply(res, args);
    };
    
    next();
  }
  
  // Track authentication attempts
  trackAuth(success) {
    if (success) {
      this.auth.successful++;
    } else {
      this.auth.failed++;
    }
  }
  
  // Track pizza purchases
  trackPizzaPurchase(count, success, revenue, latency) {
    if (success) {
      this.pizzas.sold += count;
      this.pizzas.revenue += revenue;
    } else {
      this.pizzas.failures += count;
    }
    
    if (latency) {
      this.latency.pizzaCreation.push(latency);
    }
  }
  
  // Get CPU usage percentage
  getCpuUsagePercentage() {
    const cpuUsage = os.loadavg()[0] / os.cpus().length;
    return parseFloat((cpuUsage * 100).toFixed(2));
  }
  
  // Get memory usage percentage
  getMemoryUsagePercentage() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;
    return parseFloat(memoryUsage.toFixed(2));
  }
  
  // Build HTTP metrics
  httpMetrics(buf) {
    buf.addMetric('http_requests_total', {}, this.httpRequests.total)
      .addMetric('http_requests_get', {}, this.httpRequests.get)
      .addMetric('http_requests_post', {}, this.httpRequests.post)
      .addMetric('http_requests_put', {}, this.httpRequests.put)
      .addMetric('http_requests_delete', {}, this.httpRequests.delete);
  }
  
  // Build system metrics
  systemMetrics(buf) {
    buf.addMetric('cpu_percentage', {}, this.getCpuUsagePercentage())
      .addMetric('memory_percentage', {}, this.getMemoryUsagePercentage());
  }
  
  // Build user metrics
  userMetrics(buf) {
    buf.addMetric('active_users', {}, this.activeUsers.size);
  }
  
  // Build auth metrics
  authMetrics(buf) {
    buf.addMetric('auth_successful', {}, this.auth.successful)
      .addMetric('auth_failed', {}, this.auth.failed);
  }
  
  // Build purchase metrics
  purchaseMetrics(buf) {
    buf.addMetric('pizzas_sold', {}, this.pizzas.sold)
      .addMetric('pizzas_failures', {}, this.pizzas.failures)
      .addMetric('pizzas_revenue', {}, this.pizzas.revenue);
    
    // Calculate average latencies and reset arrays
    if (this.latency.service.length > 0) {
      const avgServiceLatency = this.latency.service.reduce((a, b) => a + b, 0) / this.latency.service.length;
      buf.addMetric('service_latency', {}, parseFloat(avgServiceLatency.toFixed(2)));
      this.latency.service = []; // Reset after reporting
    }
    
    if (this.latency.pizzaCreation.length > 0) {
      const avgPizzaLatency = this.latency.pizzaCreation.reduce((a, b) => a + b, 0) / this.latency.pizzaCreation.length;
      buf.addMetric('pizza_creation_latency', {}, parseFloat(avgPizzaLatency.toFixed(2)));
      this.latency.pizzaCreation = []; // Reset after reporting
    }
  }
  
  // Send metrics to Grafana
  sendMetricToGrafana(metrics) {
    // Skip if no metrics configuration is available (e.g., in test environment)
    if (!config.metrics || !config.metrics.url || !config.metrics.apiKey) {
      console.log('Metrics not sent - configuration missing');
      return;
    }
    
    // Parse the URL from the configuration
    try {
      const parsedUrl = new URL(config.metrics.url);
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.protocol === 'https:' ? 443 : 80,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.metrics.apiKey}`,
          'Content-Type': 'text/plain',
          'Content-Length': Buffer.byteLength(metrics)
        }
      };
      
      const req = (parsedUrl.protocol === 'https:' ? https : require('http')).request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode !== 204) {
            console.error(`Failed to send metrics. Status code: ${res.statusCode}`);
            console.error(`Response: ${responseData}`);
          }
        });
      });
      
      req.on('error', (error) => {
        console.error(`Error sending metrics: ${error.message}`);
      });
      
      req.write(metrics);
      req.end();
    } catch (error) {
      console.error(`Error preparing metrics request: ${error.message}`);
    }
  }
  
  // Start periodic reporting
  startPeriodicReporting(period) {
    setInterval(() => {
      try {
        const buf = new MetricBuilder();
        this.httpMetrics(buf);
        this.systemMetrics(buf);
        this.userMetrics(buf);
        this.purchaseMetrics(buf);
        this.authMetrics(buf);
        
        const metrics = buf.toString('\n');
        this.sendMetricToGrafana(metrics);
        console.log('Metrics sent to Grafana');
      } catch (error) {
        console.error('Error sending metrics:', error);
      }
    }, period);
  }
}

// Create and export singleton instance
const metrics = new Metrics();
module.exports = metrics;