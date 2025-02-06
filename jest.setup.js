process.env.NODE_ENV = 'test';

jest.mock('./src/config', () => ({
  jwtSecret: 'test-secret',
  db: {
    connection: {
      host: 'localhost',
      user: 'test',
      password: 'test',
      database: 'test',
      connectTimeout: 60000,
    },
    listPerPage: 10,
  },
  factory: {
    url: 'https://test-factory.com',
    apiKey: 'test-key',
  },
}));