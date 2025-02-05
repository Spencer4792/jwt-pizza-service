const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const orderRouter = require('../src/routes/orderRouter');
const { DB } = require('../src/database/database');
const { setAuthUser } = require('../src/routes/authRouter');

// Mock fetch
global.fetch = jest.fn();

// Mock the database calls
jest.mock('../src/database/database', () => ({
  DB: {
    getMenu: jest.fn(),
    addMenuItem: jest.fn(),
    getOrders: jest.fn(),
    addDinerOrder: jest.fn(),
    isLoggedIn: jest.fn(),
    Role: {
      Admin: 'admin',
      Diner: 'diner'
    }
  }
}));

const app = express();
app.use(express.json());
app.use(setAuthUser);
app.use('/', orderRouter);

describe('Order Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DB.isLoggedIn.mockResolvedValue(true);
    global.fetch.mockClear();
  });

  describe('GET /menu', () => {
    test('should return menu items', async () => {
      const mockMenu = [
        { id: 1, title: 'Pizza 1', price: 10 },
        { id: 2, title: 'Pizza 2', price: 12 }
      ];

      DB.getMenu.mockResolvedValue(mockMenu);

      const res = await request(app).get('/menu');

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      expect(res.body).toHaveLength(2);
    });
  });

  describe('PUT /menu', () => {
    test('should return 403 when non-admin tries to add menu item', async () => {
      const token = jwt.sign(
        { id: 1, roles: [{ role: 'diner' }], isRole: () => false },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .put('/menu')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Pizza' });

      expect(res.statusCode).toBe(403);
    });

    test('should add menu item successfully as admin', async () => {
      const token = jwt.sign(
        { id: 1, roles: [{ role: 'admin' }], isRole: () => true },
        process.env.JWT_SECRET || 'test-secret'
      );

      const newItem = {
        title: 'New Pizza',
        description: 'Delicious',
        price: 15
      };

      const mockMenu = [{ id: 1, ...newItem }];
      
      DB.addMenuItem.mockResolvedValue(newItem);
      DB.getMenu.mockResolvedValue(mockMenu);

      const res = await request(app)
        .put('/menu')
        .set('Authorization', `Bearer ${token}`)
        .send(newItem);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      expect(res.body).toEqual(mockMenu);
    });
  });

  describe('POST /', () => {
    test('should create order successfully', async () => {
      const token = jwt.sign(
        { id: 1, name: 'Test User', email: 'test@example.com', roles: [{ role: 'diner' }], isRole: () => true },
        process.env.JWT_SECRET || 'test-secret'
      );

      const orderData = {
        franchiseId: 1,
        storeId: 1,
        items: [{ menuId: 1, description: 'Pizza', price: 10 }]
      };

      const factoryResponse = {
        ok: true,
        json: () => Promise.resolve({ jwt: 'factory-token', reportUrl: 'test-url' })
      };

      DB.addDinerOrder.mockResolvedValue({ id: 1, ...orderData });
      global.fetch.mockResolvedValue(factoryResponse);

      const res = await request(app)
        .post('/')
        .set('Authorization', `Bearer ${token}`)
        .send(orderData);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('order');
      expect(res.body).toHaveProperty('jwt');
    });

    test('should handle factory error', async () => {
      const token = jwt.sign(
        { id: 1, name: 'Test User', email: 'test@example.com', roles: [{ role: 'diner' }], isRole: () => true },
        process.env.JWT_SECRET || 'test-secret'
      );

      const orderData = {
        franchiseId: 1,
        storeId: 1,
        items: [{ menuId: 1, description: 'Pizza', price: 10 }]
      };

      const factoryResponse = {
        ok: false,
        json: () => Promise.resolve({ reportUrl: 'error-url' })
      };

      DB.addDinerOrder.mockResolvedValue({ id: 1, ...orderData });
      global.fetch.mockResolvedValue(factoryResponse);

      const res = await request(app)
        .post('/')
        .set('Authorization', `Bearer ${token}`)
        .send(orderData);

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('message', 'Failed to fulfill order at factory');
    });
  });
});