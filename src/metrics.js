const config = require('./config');
const os = require('os');
const https = require('https');

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
  
  // Build OTLP metrics payload
  buildOTLPMetricsPayload() {
    const now = Date.now() * 1000000; // Convert to nanoseconds
    
    // Calculate average latencies
    let avgServiceLatency = 0;
    if (this.latency.service.length > 0) {
      avgServiceLatency = this.latency.service.reduce((a, b) => a + b, 0) / this.latency.service.length;
      this.latency.service = []; // Reset after reporting
    }
    
    let avgPizzaLatency = 0;
    if (this.latency.pizzaCreation.length > 0) {
      avgPizzaLatency = this.latency.pizzaCreation.reduce((a, b) => a + b, 0) / this.latency.pizzaCreation.length;
      this.latency.pizzaCreation = []; // Reset after reporting
    }
    
    // Define resource attributes
    const resource = {
      attributes: [
        { key: "service.name", value: { stringValue: config.metrics?.source || "jwt-pizza-service" } }
      ]
    };
    
    // Define metrics
    const metrics = [
      // HTTP request metrics
      this.createGaugeMetric("http_requests_total", "1", this.httpRequests.total, now),
      this.createGaugeMetric("http_requests_get", "1", this.httpRequests.get, now),
      this.createGaugeMetric("http_requests_post", "1", this.httpRequests.post, now),
      this.createGaugeMetric("http_requests_put", "1", this.httpRequests.put, now),
      this.createGaugeMetric("http_requests_delete", "1", this.httpRequests.delete, now),
      
      // Auth metrics
      this.createGaugeMetric("auth_successful", "1", this.auth.successful, now),
      this.createGaugeMetric("auth_failed", "1", this.auth.failed, now),
      
      // User metrics
      this.createGaugeMetric("active_users", "1", this.activeUsers.size, now),
      
      // System metrics
      this.createGaugeMetric("cpu_percentage", "%", this.getCpuUsagePercentage(), now),
      this.createGaugeMetric("memory_percentage", "%", this.getMemoryUsagePercentage(), now),
      
      // Pizza metrics
      this.createGaugeMetric("pizzas_sold", "1", this.pizzas.sold, now),
      this.createGaugeMetric("pizzas_failures", "1", this.pizzas.failures, now),
      this.createGaugeMetric("pizzas_revenue", "$", this.pizzas.revenue, now),
      
      // Latency metrics
      this.createGaugeMetric("service_latency", "ms", avgServiceLatency, now),
      this.createGaugeMetric("pizza_creation_latency", "ms", avgPizzaLatency, now)
    ];
    
    // Construct the final payload
    return {
      resourceMetrics: [
        {
          resource: resource,
          scopeMetrics: [
            {
              metrics: metrics
            }
          ]
        }
      ]
    };
  }
  
  // Helper to create a gauge metric in OTLP format
  createGaugeMetric(name, unit, value, timeNanoseconds) {
    return {
      name: name,
      unit: unit,
      gauge: {
        dataPoints: [
          {
            asDouble: value,
            timeUnixNano: timeNanoseconds
          }
        ]
      }
    };
  }
  
  // Send metrics to Grafana
  sendMetricsToGrafana() {
    // Skip if no metrics configuration is available (e.g., in test environment)
    if (!config.metrics || !config.metrics.url || !config.metrics.apiKey) {
      console.log('Metrics not sent - configuration missing');
      return;
    }
    
    try {
      // Build OTLP metrics payload
      const payload = this.buildOTLPMetricsPayload();
      const data = JSON.stringify(payload);
      
      // Parse the URL from the configuration
      const parsedUrl = new URL(config.metrics.url);
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.protocol === 'https:' ? 443 : 80,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.metrics.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };
      
      const req = (parsedUrl.protocol === 'https:' ? https : require('http')).request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode !== 200 && res.statusCode !== 204) {
            console.error(`Failed to send metrics. Status code: ${res.statusCode}`);
            console.error(`Response: ${responseData}`);
          } else {
            console.log('Metrics sent successfully to Grafana');
          }
        });
      });
      
      req.on('error', (error) => {
        console.error(`Error sending metrics: ${error.message}`);
      });
      
      req.write(data);
      req.end();
    } catch (error) {
      console.error(`Error preparing metrics request: ${error.message}`);
    }
  }
  
  // Start periodic reporting
  startPeriodicReporting(period) {
    setInterval(() => {
      try {
        this.sendMetricsToGrafana();
      } catch (error) {
        console.error('Error sending metrics:', error);
      }
    }, period);
  }
}

// Create and export singleton instance
const metrics = new Metrics();
module.exports = metrics;