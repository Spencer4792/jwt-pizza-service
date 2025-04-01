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
    source: 'jwt-pizza-service-dev',
    url: process.env.METRICS_URL || 'https://influx-prod-13-prod-us-east-0.grafana.net/api/v1/push/influx/write',
    apiKey: process.env.METRICS_API_KEY
  },
};