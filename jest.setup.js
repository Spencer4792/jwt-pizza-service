process.env.JWT_SECRET = 'test-jwt-secret';
process.env.FACTORY_API_KEY = 'test-factory-api-key';

// Mock the isRole function that's used in tokens
global.isRole = (role) => true;