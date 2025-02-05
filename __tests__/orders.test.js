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
      expect(res.body).toEqual(mockMenu);
    });

    test('should handle database errors', async () => {
      DB.getMenu.mockRejectedValue(new Error('Database error'));

      const res = await request(app).get('/menu');

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('message', 'Failed to get menu items');
    });
  });

  describe('PUT /menu', () => {
    test('should return 401 without authentication', async () => {
      const res = await request(app)
        .put('/menu')
        .send({ title: 'New Pizza', price: 15 });

      expect(res.statusCode).toBe(401);
    });

    test('should return 403 when non-admin tries to add menu item', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'diner' }],
          isRole: (role) => role === 'diner'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .put('/menu')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Pizza', price: 15 });

      expect(res.statusCode).toBe(403);
      expect(res.body).toHaveProperty('message', 'Requires admin role');
    });

    test('should return 400 for invalid menu item data', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'admin' }],
          isRole: (role) => role === 'admin'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .put('/menu')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Pizza' }); // Missing price

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('message', 'Title and price are required');
    });

    test('should add menu item successfully as admin', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'admin' }],
          isRole: (role) => role === 'admin'
        },
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

    test('should handle database error when adding menu item', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'admin' }],
          isRole: (role) => role === 'admin'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      DB.addMenuItem.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .put('/menu')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Pizza', price: 15 });

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('message', 'Failed to add menu item');
    });
  });

  describe('POST /', () => {
    test('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/')
        .send({
          franchiseId: 1,
          storeId: 1,
          items: [{ menuId: 1, description: 'Pizza', price: 10 }]
        });

      expect(res.statusCode).toBe(401);
    });

    test('should return 403 when non-diner tries to create order', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'admin' }],
          isRole: (role) => role === 'admin'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .post('/')
        .set('Authorization', `Bearer ${token}`)
        .send({
          franchiseId: 1,
          storeId: 1,
          items: [{ menuId: 1, description: 'Pizza', price: 10 }]
        });

      expect(res.statusCode).toBe(403);
      expect(res.body).toHaveProperty('message', 'Requires diner role');
    });

    test('should return 400 for invalid order data', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'diner' }],
          isRole: (role) => role === 'diner'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .post('/')
        .set('Authorization', `Bearer ${token}`)
        .send({ franchiseId: 1 }); // Missing required fields

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('message', 'Invalid order data');
    });

    test('should create order successfully', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          name: 'Test User', 
          email: 'test@example.com', 
          roles: [{ role: 'diner' }],
          isRole: (role) => role === 'diner'
        },
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
      expect(res.body).toHaveProperty('jwt', 'factory-token');
      expect(res.body).toHaveProperty('reportUrl', 'test-url');
    });

    test('should handle database error when creating order', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'diner' }],
          isRole: (role) => role === 'diner'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      DB.addDinerOrder.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .post('/')
        .set('Authorization', `Bearer ${token}`)
        .send({
          franchiseId: 1,
          storeId: 1,
          items: [{ menuId: 1, description: 'Pizza', price: 10 }]
        });

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('message', 'Failed to create order');
    });

    test('should handle factory error response', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'diner' }],
          isRole: (role) => role === 'diner'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      const orderData = {
        franchiseId: 1,
        storeId: 1,
        items: [{ menuId: 1, description: 'Pizza', price: 10 }]
      };

      const factoryResponse = {
        ok: false,
        json: () => Promise.resolve({ error: 'Factory error' })
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

    test('should handle factory network error', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'diner' }],
          isRole: (role) => role === 'diner'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      const orderData = {
        franchiseId: 1,
        storeId: 1,
        items: [{ menuId: 1, description: 'Pizza', price: 10 }]
      };

      DB.addDinerOrder.mockResolvedValue({ id: 1, ...orderData });
      global.fetch.mockRejectedValue(new Error('Network error'));

      const res = await request(app)
        .post('/')
        .set('Authorization', `Bearer ${token}`)
        .send(orderData);

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('message', 'Failed to fulfill order at factory');
    });
  });

  describe('GET /', () => {
    test('should return 401 without authentication', async () => {
      const res = await request(app).get('/');
      expect(res.statusCode).toBe(401);
    });

    test('should return user orders successfully', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'diner' }],
          isRole: (role) => role === 'diner'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      const mockOrders = [
        { id: 1, items: [] },
        { id: 2, items: [] }
      ];

      DB.getOrders.mockResolvedValue(mockOrders);

      const res = await request(app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      expect(res.body).toEqual(mockOrders);
    });

    test('should handle database error when getting orders', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'diner' }],
          isRole: (role) => role === 'diner'
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      DB.getOrders.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .get('/')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('message', 'Failed to get orders');
    });
  });
});