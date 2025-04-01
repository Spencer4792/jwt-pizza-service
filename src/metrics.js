const config = require('./config');
const os = require('os');


const metrics = {
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


function requestTracker(req, res, next) {
  const startTime = Date.now();
  
  
  metrics.http.requests.total++;
  
  
  const method = req.method.toLowerCase();
  if (metrics.http.requests[method] !== undefined) {
    metrics.http.requests[method]++;
  }
  
  
  const endpoint = `${req.method} ${req.path}`;
  if (!metrics.http.endpoints[endpoint]) {
    metrics.http.endpoints[endpoint] = 0;
  }
  metrics.http.endpoints[endpoint]++;
  
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (!metrics.latency.endpoints[endpoint]) {
      metrics.latency.endpoints[endpoint] = [];
    }
    metrics.latency.endpoints[endpoint].push(duration);
    
    
    if (metrics.latency.endpoints[endpoint].length > 100) {
      metrics.latency.endpoints[endpoint].shift();
    }
  });
  
  next();
}


function trackAuth(success, userId = null) {
  if (success) {
    metrics.auth.successful++;
    if (userId) {
      metrics.users.active.add(userId);
    }
  } else {
    metrics.auth.failed++;
  }
}


function trackLogout(userId) {
  if (userId) {
    metrics.users.active.delete(userId);
  }
}


function trackPizzaPurchase(quantity, revenue, success, latency) {
  if (success) {
    metrics.pizza.sold += quantity;
    metrics.pizza.revenue += revenue;
  } else {
    metrics.pizza.failures++;
  }
  
  metrics.latency.pizzaCreation.push(latency);
  
  
  if (metrics.latency.pizzaCreation.length > 100) {
    metrics.latency.pizzaCreation.shift();
  }
}


function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return parseFloat((cpuUsage * 100).toFixed(2));
}


function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return parseFloat(memoryUsage.toFixed(2));
}


function sendMetricToGrafana(metricName, metricValue, type, unit, attributes = {}) {
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


function httpMetrics() {
  
  sendMetricToGrafana('http_requests_total', metrics.http.requests.total, 'sum', '1');
  
  
  Object.entries(metrics.http.requests).forEach(([method, count]) => {
    if (method !== 'total') {
      sendMetricToGrafana('http_requests_by_method', count, 'sum', '1', { method });
    }
  });

  
  Object.entries(metrics.latency.endpoints).forEach(([endpoint, latencies]) => {
    if (latencies.length > 0) {
      const avgLatency = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
      sendMetricToGrafana('http_request_latency', avgLatency, 'gauge', 'ms', { endpoint });
    }
  });
}

function systemMetrics() {
  
  metrics.system.cpu = getCpuUsagePercentage();
  metrics.system.memory = getMemoryUsagePercentage();
  
  
  sendMetricToGrafana('system_cpu_usage', metrics.system.cpu, 'gauge', '%');
  sendMetricToGrafana('system_memory_usage', metrics.system.memory, 'gauge', '%');
}

function userMetrics() {
  
  sendMetricToGrafana('active_users', metrics.users.active.size, 'gauge', '1');
}

function authMetrics() {
  
  sendMetricToGrafana('auth_successful', metrics.auth.successful, 'sum', '1');
  sendMetricToGrafana('auth_failed', metrics.auth.failed, 'sum', '1');
}

function pizzaMetrics() {
  
  sendMetricToGrafana('pizzas_sold', metrics.pizza.sold, 'sum', '1');
  
  
  sendMetricToGrafana('pizza_revenue', metrics.pizza.revenue, 'sum', 'usd');
  
  
  sendMetricToGrafana('pizza_creation_failures', metrics.pizza.failures, 'sum', '1');
  
  
  if (metrics.latency.pizzaCreation.length > 0) {
    const avgLatency = metrics.latency.pizzaCreation.reduce((sum, val) => sum + val, 0) / metrics.latency.pizzaCreation.length;
    sendMetricToGrafana('pizza_creation_latency', avgLatency, 'gauge', 'ms');
  }
}


function startMetricsReporting(period = 10000) {
  console.log(`Starting metrics reporting every ${period/1000} seconds`);
  
  return setInterval(() => {
    try {
      httpMetrics();
      systemMetrics();
      userMetrics();
      authMetrics();
      pizzaMetrics();
    } catch (error) {
      console.error('Error reporting metrics:', error);
    }
  }, period);
}

module.exports = {
  requestTracker,
  trackAuth,
  trackLogout,
  trackPizzaPurchase,
  startMetricsReporting
};