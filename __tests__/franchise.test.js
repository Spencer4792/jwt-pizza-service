const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const franchiseRouter = require('../src/routes/franchiseRouter');
const { DB } = require('../src/database/database');
const { setAuthUser } = require('../src/routes/authRouter');

// Mock the database calls
jest.mock('../src/database/database', () => ({
  DB: {
    getFranchises: jest.fn(),
    getFranchise: jest.fn(),
    getUserFranchises: jest.fn(),
    createFranchise: jest.fn(),
    deleteFranchise: jest.fn(),
    createStore: jest.fn(),
    deleteStore: jest.fn(),
    isLoggedIn: jest.fn()
  },
  Role: {
    Admin: 'admin',
    Franchisee: 'franchisee'
  }
}));

const app = express();
app.use(express.json());
app.use(setAuthUser);
app.use('/franchise', franchiseRouter);

describe('Franchise Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DB.isLoggedIn.mockResolvedValue(true);
  });

  describe('GET /franchise', () => {
    test('should return all franchises', async () => {
      const mockFranchises = [
        { id: 1, name: 'Franchise 1', stores: [] },
        { id: 2, name: 'Franchise 2', stores: [] }
      ];

      DB.getFranchises.mockResolvedValue(mockFranchises);

      const res = await request(app).get('/franchise');

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      expect(res.body).toHaveLength(2);
    });
  });

  describe('POST /franchise', () => {
    test('should create franchise when admin', async () => {
      const token = jwt.sign(
        { id: 1, roles: [{ role: 'admin' }], isRole: () => true },
        process.env.JWT_SECRET || 'test-secret'
      );

      const franchiseData = {
        name: 'New Franchise',
        admins: [{ email: 'admin@test.com' }]
      };

      DB.createFranchise.mockResolvedValue({ id: 1, ...franchiseData });

      const res = await request(app)
        .post('/franchise')
        .set('Authorization', `Bearer ${token}`)
        .send(franchiseData);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('id');
    });
  });

  describe('POST /franchise/:franchiseId/store', () => {
    test('should create store for franchise', async () => {
      const token = jwt.sign(
        { id: 1, roles: [{ role: 'admin' }], isRole: () => true },
        process.env.JWT_SECRET || 'test-secret'
      );

      const storeData = {
        name: 'New Store'
      };

      DB.getFranchise.mockResolvedValue({ id: 1, name: 'Franchise 1' });
      DB.createStore.mockResolvedValue({ id: 1, ...storeData });

      const res = await request(app)
        .post('/franchise/1/store')
        .set('Authorization', `Bearer ${token}`)
        .send(storeData);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('id');
    });
  });
});