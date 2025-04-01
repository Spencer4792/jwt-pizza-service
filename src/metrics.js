const config = require('./config');
const os = require('os');

class Metrics {
  constructor() {
    this.data = {
      http: {
        requests: { total: 0, get: 0, post: 0, put: 0, delete: 0 },
        endpoints: {}
      },
      auth: {
        successful: 0,
        failed: 0
      },
      users: {
        active: new Set()
      },
      system: {
        cpu: 0,
        memory: 0
      },
      pizza: {
        sold: 0,
        revenue: 0,
        failures: 0
      },
      latency: {
        endpoints: {},
        pizzaCreation: []
      }
    };

    this.reporterInterval = null;
  }

  requestTracker(req, res, next) {
    const startTime = Date.now();
    
    // Track total requests
    this.data.http.requests.total++;
    
    // Track request by method
    const method = req.method.toLowerCase();
    if (this.data.http.requests[method] !== undefined) {
      this.data.http.requests[method]++;
    }
    
    // Track endpoint usage
    const endpoint = `${req.method} ${req.path}`;
    if (!this.data.http.endpoints[endpoint]) {
      this.data.http.endpoints[endpoint] = 0;
    }
    this.data.http.endpoints[endpoint]++;
    
    // Track response latency
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      if (!this.data.latency.endpoints[endpoint]) {
        this.data.latency.endpoints[endpoint] = [];
      }
      this.data.latency.endpoints[endpoint].push(duration);
      
      // Limit array size to avoid memory issues
      if (this.data.latency.endpoints[endpoint].length > 100) {
        this.data.latency.endpoints[endpoint].shift();
      }
    });
    
    next();
  }

  trackAuth(success, userId = null) {
    if (success) {
      this.data.auth.successful++;
      if (userId) {
        this.data.users.active.add(userId);
      }
    } else {
      this.data.auth.failed++;
    }
  }

  trackLogout(userId) {
    if (userId) {
      this.data.users.active.delete(userId);
    }
  }

  trackPizzaPurchase(quantity, revenue, success, latency) {
    if (success) {
      this.data.pizza.sold += quantity;
      this.data.pizza.revenue += revenue;
    } else {
      this.data.pizza.failures++;
    }
    
    this.data.latency.pizzaCreation.push(latency);
    
    // Limit array size to avoid memory issues
    if (this.data.latency.pizzaCreation.length > 100) {
      this.data.latency.pizzaCreation.shift();
    }
  }

  getCpuUsagePercentage() {
    const cpuUsage = os.loadavg()[0] / os.cpus().length;
    return parseFloat((cpuUsage * 100).toFixed(2));
  }

  getMemoryUsagePercentage() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;
    return parseFloat(memoryUsage.toFixed(2));
  }

  // Try the OTLP format (OpenTelemetry)
  async sendMetricToGrafana(metricName, metricValue, type, unit, attributes = {}) {
    attributes = { ...attributes, source: config.metrics.source };

    const metric = {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: metricName,
                  unit: unit,
                  [type]: {
                    dataPoints: [
                      {
                        asInt: Math.round(metricValue),
                        timeUnixNano: Date.now() * 1000000,
                        attributes: [],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    if (type === 'sum') {
      metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
      metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].isMonotonic = true;
    }

    // Add attributes
    Object.keys(attributes).forEach((key) => {
      metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].dataPoints[0].attributes.push({
        key: key,
        value: { stringValue: attributes[key] },
      });
    });

    const body = JSON.stringify(metric);
    
    // Enhanced debugging
    console.log(`---------------------`);
    console.log(`Attempting to send metric: ${metricName}, value: ${metricValue}, type: ${type}`);
    console.log(`URL: ${config.metrics.url}`);
    console.log(`API Key: ${config.metrics.apiKey.substring(0, 10)}...`);
    
    try {
      // OTLP API approach
      const response = await fetch(`${config.metrics.url}`, {
        method: 'POST',
        body: body,
        headers: { 
          Authorization: `Bearer ${config.metrics.apiKey}`, 
          'Content-Type': 'application/json' 
        },
      });
      
      console.log(`Response status: ${response.status}`);
      
      if (!response.ok) {
        const text = await response.text();
        console.error(`Failed to push metrics data to Grafana: ${text}`);
        
        // Try an alternative approach if OTLP fails
        if (config.metrics.url.includes('otlp')) {
          console.log("OTLP approach failed, trying InfluxDB API approach...");
          await this.sendMetricToGrafanaInfluxDB(metricName, metricValue, attributes);
        }
      } else {
        console.log(`Successfully sent metric: ${metricName} with value ${metricValue}`);
        return true;
      }
    } catch (error) {
      console.error(`Network error sending metric ${metricName}:`, error.message);
      
      // Try alternative approach if OTLP throws an error
      if (config.metrics.url.includes('otlp')) {
        console.log("OTLP approach errored, trying InfluxDB API approach...");
        return await this.sendMetricToGrafanaInfluxDB(metricName, metricValue, attributes);
      }
    }
    
    return false;
  }
  
  // Alternative approach using InfluxDB Line Protocol
  async sendMetricToGrafanaInfluxDB(metricName, metricValue, attributes = {}) {
    try {
      // This is a more common approach for sending metrics to Grafana Cloud
      // Construct InfluxDB line protocol format
      const tags = Object.entries(attributes)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');
        
      const lineProtocol = `${metricName},${tags} value=${metricValue} ${Date.now() * 1000000}`;
      
      console.log("Trying InfluxDB format:", lineProtocol);
      
      // Construct a URL that looks like the one in the instructions
      let influxUrl = config.metrics.url;
      if (influxUrl.includes('otlp')) {
        // Try to derive an InfluxDB compatible URL
        influxUrl = influxUrl.replace('otlp-gateway', 'influx-prod-13').replace('/otlp/v1/metrics', '/api/v1/push/influx/write');
      }
      
      console.log(`Using InfluxDB URL: ${influxUrl}`);
      
      const response = await fetch(influxUrl, {
        method: 'POST',
        body: lineProtocol,
        headers: {
          'Authorization': `Bearer ${config.metrics.apiKey}`,
          'Content-Type': 'text/plain'
        }
      });
      
      console.log(`InfluxDB response status: ${response.status}`);
      
      if (!response.ok) {
        const text = await response.text();
        console.error(`Failed to push metrics via InfluxDB: ${text}`);
        return false;
      } else {
        console.log(`Successfully sent metric via InfluxDB: ${metricName}`);
        return true;
      }
    } catch (error) {
      console.error(`Network error sending metric via InfluxDB ${metricName}:`, error.message);
      return false;
    }
  }

  httpMetrics() {
    // Total requests
    this.sendMetricToGrafana('http_requests_total', this.data.http.requests.total, 'sum', '1');
    
    // Requests by method
    Object.entries(this.data.http.requests).forEach(([method, count]) => {
      if (method !== 'total') {
        this.sendMetricToGrafana('http_requests_by_method', count, 'sum', '1', { method });
      }
    });

    // Average latency by endpoint
    Object.entries(this.data.latency.endpoints).forEach(([endpoint, latencies]) => {
      if (latencies.length > 0) {
        const avgLatency = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
        this.sendMetricToGrafana('http_request_latency', avgLatency, 'gauge', 'ms', { endpoint });
      }
    });
  }

  systemMetrics() {
    // Update CPU and memory metrics
    this.data.system.cpu = this.getCpuUsagePercentage();
    this.data.system.memory = this.getMemoryUsagePercentage();
    
    // Send to Grafana
    this.sendMetricToGrafana('system_cpu_usage', this.data.system.cpu, 'gauge', '%');
    this.sendMetricToGrafana('system_memory_usage', this.data.system.memory, 'gauge', '%');
  }

  userMetrics() {
    // Active users count
    this.sendMetricToGrafana('active_users', this.data.users.active.size, 'gauge', '1');
  }

  authMetrics() {
    // Authentication attempts
    this.sendMetricToGrafana('auth_successful', this.data.auth.successful, 'sum', '1');
    this.sendMetricToGrafana('auth_failed', this.data.auth.failed, 'sum', '1');
  }

  pizzaMetrics() {
    // Pizzas sold
    this.sendMetricToGrafana('pizzas_sold', this.data.pizza.sold, 'sum', '1');
    
    // Pizza revenue
    this.sendMetricToGrafana('pizza_revenue', this.data.pizza.revenue, 'sum', 'usd');
    
    // Pizza creation failures
    this.sendMetricToGrafana('pizza_creation_failures', this.data.pizza.failures, 'sum', '1');
    
    // Pizza creation latency
    if (this.data.latency.pizzaCreation.length > 0) {
      const avgLatency = this.data.latency.pizzaCreation.reduce((sum, val) => sum + val, 0) / this.data.latency.pizzaCreation.length;
      this.sendMetricToGrafana('pizza_creation_latency', avgLatency, 'gauge', 'ms');
    }
  }

  startMetricsReporting(period = 10000) {
    console.log(`Starting metrics reporting every ${period/1000} seconds`);
    
    // Clear any existing interval
    if (this.reporterInterval) {
      clearInterval(this.reporterInterval);
    }
    
    this.reporterInterval = setInterval(() => {
      try {
        this.httpMetrics();
        this.systemMetrics();
        this.userMetrics();
        this.authMetrics();
        this.pizzaMetrics();
      } catch (error) {
        console.error('Error reporting metrics:', error);
      }
    }, period);
    
    return this.reporterInterval;
  }
  
  stopMetricsReporting() {
    if (this.reporterInterval) {
      clearInterval(this.reporterInterval);
      this.reporterInterval = null;
      console.log('Metrics reporting stopped');
    }
  }
}

// Create a singleton instance
const metricsInstance = new Metrics();

// Create bound functions for module exports
const requestTracker = (req, res, next) => metricsInstance.requestTracker(req, res, next);
const trackAuth = (success, userId) => metricsInstance.trackAuth(success, userId);
const trackLogout = (userId) => metricsInstance.trackLogout(userId);
const trackPizzaPurchase = (quantity, revenue, success, latency) => 
  metricsInstance.trackPizzaPurchase(quantity, revenue, success, latency);
const startMetricsReporting = (period) => metricsInstance.startMetricsReporting(period);
const stopMetricsReporting = () => metricsInstance.stopMetricsReporting();

// Export the singleton instance and bound functions
module.exports = {
  metrics: metricsInstance,
  requestTracker,
  trackAuth,
  trackLogout,
  trackPizzaPurchase,
  startMetricsReporting,
  stopMetricsReporting
};