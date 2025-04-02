const fetch = require('node-fetch');

// Grafana Loki credentials - same as in your config
const loggingConfig = {
  source: 'jwt-pizza-service-dev',
  userId: '1170504',
  url: 'https://logs-prod-036.grafana.net/loki/api/v1/push',
  apiKey: 'glc_eyJvIjoiMTM4ODQyNyIsIm4iOiJzdGFjay0xMjEyNzA3LWludGVncmF0aW9uLWp3dC1waXp6YS1sb2dzIiwiayI6IjAwSDF1bkZhdjA1NWY0SEF2RjU0Nm9CZiIsIm0iOnsiciI6InByb2QtdXMtZWFzdC0wIn19'
};

// Format timestamp in nanoseconds since epoch
const timestamp = (Date.now() * 1000000).toString();

// Create test log event in Loki format
const logEvent = {
  streams: [
    {
      stream: {
        component: loggingConfig.source,
        level: "info",
        type: "test"
      },
      values: [
        [timestamp, "This is a test log message"]
      ]
    }
  ]
};

// Send the log event to Grafana Loki
console.log('Sending test log to Grafana Loki...');
console.log(JSON.stringify(logEvent, null, 2));

fetch(loggingConfig.url, {
  method: 'post',
  body: JSON.stringify(logEvent),
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${loggingConfig.userId}:${loggingConfig.apiKey}`
  }
})
.then(res => {
  console.log('Response status:', res.status);
  if (res.ok) {
    console.log('Successfully sent log to Grafana Loki!');
  } else {
    return res.text().then(text => {
      console.error('Failed to send log to Grafana Loki:', text);
    });
  }
})
.catch(err => {
  console.error('Error sending log to Grafana Loki:', err.message);
});