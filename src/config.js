module.exports = {
  jwtSecret: process.env.JWT_SECRET,
  db: {
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'tempdbpassword',
      database: process.env.DB_NAME || 'pizza',
      connectTimeout: 60000,
    },
    listPerPage: 10,
  },
  factory: {
    url: 'https://pizza-factory.cs329.click',
    apiKey: process.env.FACTORY_API_KEY,
  },
  metrics: {
    source: 'jwt-pizza-service',
    url: 'https://otlp-gateway-prod-us-east-2.grafana.net/otlp/v1/metrics',
    apiKey: '1212707:glc_eyJvIjoiMTM4ODQyNyIsIm4iOiJzdGFjay0xMjEyNzA3LWludGVncmF0aW9uLWp3dC1waXp6YS1tZXRyaWNzIiwiayI6Ims1NFYwazU3dmhEaTQ2WWdFMTZOMk52SiIsIm0iOnsiciI6InByb2QtdXMtZWFzdC0wIn19',
  },
  logging: {
    source: process.env.LOGGING_SOURCE || 'jwt-pizza-service-dev',
    userId: process.env.LOGGING_USER_ID || '1170504',
    url: process.env.LOGGING_URL || 'https://logs-prod-036.grafana.net/loki/api/v1/push',
    apiKey: process.env.LOGGING_API_KEY || 'glc_eyJvIjoiMTM4ODQyNyIsIm4iOiJzdGFjay0xMjEyNzA3LWludGVncmF0aW9uLWp3dC1waXp6YS1sb2dzIiwiayI6IjAwSDF1bkZhdjA1NWY0SEF2RjU0Nm9CZiIsIm0iOnsiciI6InByb2QtdXMtZWFzdC0wIn19'
  }
};