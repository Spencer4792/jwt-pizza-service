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
};