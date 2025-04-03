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
    // Check if running in test environment
    this.enabled = process.env.NODE_ENV !== 'test';
  }

  requestTracker(req, res, next) {
    const startTime = Date.now();
    
    this.data.http.requests.total++;
    
    const method = req.method.toLowerCase();
    if (this.data.http.requests[method] !== undefined) {
      this.data.http.requests[method]++;
    }
    
    const endpoint = `${req.method} ${req.path}`;
    if (!this.data.http.endpoints[endpoint]) {
      this.data.http.endpoints[endpoint] = 0;
    }
    this.data.http.endpoints[endpoint]++;
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      if (!this.data.latency.endpoints[endpoint]) {
        this.data.latency.endpoints[endpoint] = [];
      }
      this.data.latency.endpoints[endpoint].push(duration);
      
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

  sendMetricToGrafana(metricName, metricValue, type, unit, attributes = {}) {
    // Check if metrics config exists before proceeding
    if (!config.metrics) {
      console.warn('Metrics configuration is missing. Skipping metric send.');
      return Promise.resolve(); // Return a resolved promise to maintain the promise chain
    }
    
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
    
    Object.keys(attributes).forEach((key) => {
      metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].dataPoints[0].attributes.push({
        key: key,
        value: { stringValue: attributes[key] },
      });
    });

    const body = JSON.stringify(metric);
    
    return fetch(`${config.metrics.url}`, {
      method: 'POST',
      body: body,
      headers: { 
        Authorization: `Bearer ${config.metrics.apiKey}`, 
        'Content-Type': 'application/json' 
      },
    })
    .then((response) => {
      if (!response.ok) {
        return response.text().then((text) => {
          console.error(`Failed to push metrics data to Grafana: ${text}\n${body}`);
        });
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error);
    });
  }

  httpMetrics() {
    this.sendMetricToGrafana('http_requests_total', this.data.http.requests.total, 'sum', '1');
    
    Object.entries(this.data.http.requests).forEach(([method, count]) => {
      if (method !== 'total') {
        this.sendMetricToGrafana('http_requests_by_method', count, 'sum', '1', { method });
      }
    });
    
    Object.entries(this.data.latency.endpoints).forEach(([endpoint, latencies]) => {
      if (latencies.length > 0) {
        const avgLatency = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
        this.sendMetricToGrafana('http_request_latency', avgLatency, 'gauge', 'ms', { endpoint });
      }
    });
  }

  systemMetrics() {
    this.data.system.cpu = this.getCpuUsagePercentage();
    this.data.system.memory = this.getMemoryUsagePercentage();
    
    this.sendMetricToGrafana('system_cpu_usage', this.data.system.cpu, 'gauge', '%');
    this.sendMetricToGrafana('system_memory_usage', this.data.system.memory, 'gauge', '%');
  }

  userMetrics() {
    this.sendMetricToGrafana('active_users', this.data.users.active.size, 'gauge', '1');
  }

  authMetrics() {
    this.sendMetricToGrafana('auth_successful', this.data.auth.successful, 'sum', '1');
    this.sendMetricToGrafana('auth_failed', this.data.auth.failed, 'sum', '1');
  }

  pizzaMetrics() {
    this.sendMetricToGrafana('pizzas_sold', this.data.pizza.sold, 'sum', '1');
    
    this.sendMetricToGrafana('pizza_revenue', this.data.pizza.revenue, 'sum', 'usd');
    
    this.sendMetricToGrafana('pizza_creation_failures', this.data.pizza.failures, 'sum', '1');
    
    if (this.data.latency.pizzaCreation.length > 0) {
      const avgLatency = this.data.latency.pizzaCreation.reduce((sum, val) => sum + val, 0) / this.data.latency.pizzaCreation.length;
      this.sendMetricToGrafana('pizza_creation_latency', avgLatency, 'gauge', 'ms');
    }
  }

  startMetricsReporting(period = 10000) {
    // Don't run metrics reporting in test environment
    if (process.env.NODE_ENV === 'test') {
      console.log('Metrics reporting disabled in test environment');
      return null;
    }
    
    console.log(`Starting metrics reporting every ${period/1000} seconds`);
    
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

// Only start metrics reporting if not in test environment
const metricsInstance = new Metrics();
if (process.env.NODE_ENV !== 'test') {
  metricsInstance.startMetricsReporting(30000);
}

const requestTracker = (req, res, next) => metricsInstance.requestTracker(req, res, next);
const trackAuth = (success, userId) => metricsInstance.trackAuth(success, userId);
const trackLogout = (userId) => metricsInstance.trackLogout(userId);
const trackPizzaPurchase = (quantity, revenue, success, latency) => 
  metricsInstance.trackPizzaPurchase(quantity, revenue, success, latency);
const startMetricsReporting = (period) => metricsInstance.startMetricsReporting(period);
const stopMetricsReporting = () => metricsInstance.stopMetricsReporting();

module.exports = {
  metrics: metricsInstance,
  requestTracker,
  trackAuth,
  trackLogout,
  trackPizzaPurchase,
  startMetricsReporting,
  stopMetricsReporting
};