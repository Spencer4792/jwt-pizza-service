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
    isLoggedIn: jest.fn(),
    Role: {
      Admin: 'admin',
      Franchisee: 'franchisee'
    }
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
      expect(res.body).toEqual(mockFranchises);
    });

    test('should handle errors', async () => {
      DB.getFranchises.mockRejectedValue(new Error('Database error'));

      const res = await request(app).get('/franchise');

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('message');
    });
  });

  describe('GET /franchise/user', () => {
    test('should return user franchises', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'franchisee' }],
          isRole: (role) => role === 'franchisee'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      const mockFranchises = [
        { id: 1, name: 'User Franchise 1', stores: [] }
      ];

      DB.getUserFranchises.mockResolvedValue(mockFranchises);

      const res = await request(app)
        .get('/franchise/user')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      expect(res.body).toEqual(mockFranchises);
    });
  });

  describe('GET /franchise/:id', () => {
    test('should return specific franchise', async () => {
      const mockFranchise = { 
        id: 1, 
        name: 'Franchise 1', 
        stores: [] 
      };

      DB.getFranchise.mockResolvedValue(mockFranchise);

      const res = await request(app).get('/franchise/1');

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(mockFranchise);
    });

    test('should handle not found franchise', async () => {
      DB.getFranchise.mockResolvedValue(null);

      const res = await request(app).get('/franchise/999');

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /franchise', () => {
    test('should create franchise when admin', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'admin' }],
          isRole: (role) => role === 'admin'
        },
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
      expect(res.body.name).toBe(franchiseData.name);
    });

    test('should return 403 when non-admin tries to create franchise', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'diner' }],
          isRole: (role) => role === 'diner'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .post('/franchise')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Franchise' });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /franchise/:franchiseId/store', () => {
    test('should create store for franchise', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'admin' }],
          isRole: (role) => role === 'admin'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      const storeData = {
        name: 'New Store',
        address: '123 Test St'
      };

      DB.getFranchise.mockResolvedValue({ id: 1, name: 'Franchise 1' });
      DB.createStore.mockResolvedValue({ id: 1, franchiseId: 1, ...storeData });

      const res = await request(app)
        .post('/franchise/1/store')
        .set('Authorization', `Bearer ${token}`)
        .send(storeData);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(storeData.name);
    });

    test('should return 404 when franchise not found', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'admin' }],
          isRole: (role) => role === 'admin'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      DB.getFranchise.mockResolvedValue(null);

      const res = await request(app)
        .post('/franchise/999/store')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Store' });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /franchise/:franchiseId', () => {
    test('should delete franchise when admin', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'admin' }],
          isRole: (role) => role === 'admin'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      DB.getFranchise.mockResolvedValue({ id: 1, name: 'Franchise 1' });
      DB.deleteFranchise.mockResolvedValue(true);

      const res = await request(app)
        .delete('/franchise/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Franchise deleted successfully');
    });

    test('should return 403 when non-admin tries to delete franchise', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'diner' }],
          isRole: (role) => role === 'diner'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .delete('/franchise/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /franchise/:franchiseId/store/:storeId', () => {
    test('should delete store when admin', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'admin' }],
          isRole: (role) => role === 'admin'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      DB.getFranchise.mockResolvedValue({ 
        id: 1, 
        name: 'Franchise 1',
        stores: [{ id: 1, name: 'Store 1' }]
      });
      DB.deleteStore.mockResolvedValue(true);

      const res = await request(app)
        .delete('/franchise/1/store/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Store deleted successfully');
    });

    test('should return 404 when store not found', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'admin' }],
          isRole: (role) => role === 'admin'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      DB.getFranchise.mockResolvedValue({ 
        id: 1, 
        name: 'Franchise 1',
        stores: []
      });

      const res = await request(app)
        .delete('/franchise/1/store/999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(404);
    });
  });
});