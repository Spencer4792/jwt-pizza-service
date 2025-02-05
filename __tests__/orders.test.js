const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('./testConfig');
const orderRouter = require('../src/routes/orderRouter');
const { DB } = require('../src/database/database');

// Mock the database calls
jest.mock('../src/database/database', () => ({
  DB: {
    getOrders: jest.fn(),
    getOrder: jest.fn(),
    createOrder: jest.fn(),
    updateOrder: jest.fn(),
    deleteOrder: jest.fn(),
    getUserById: jest.fn()
  },
}));

const app = express();
app.use(express.json());
app.use('/orders', orderRouter);

describe('Order Endpoints', () => {
  let userToken, adminToken;

  beforeEach(() => {
    jest.clearAllMocks();
    userToken = jwt.sign({ userId: 1, role: 'user' }, config.jwtSecret);
    adminToken = jwt.sign({ userId: 2, role: 'admin' }, config.jwtSecret);
  });

  describe('GET /orders', () => {
    test('should return all orders for admin', async () => {
      const mockOrders = [
        { id: 1, userId: 1, status: 'pending' },
        { id: 2, userId: 2, status: 'completed' }
      ];
      DB.getOrders.mockResolvedValue(mockOrders);

      const res = await request(app)
        .get('/orders')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      expect(res.body).toHaveLength(2);
    });

    test('should return only user orders for non-admin', async () => {
      const mockOrders = [
        { id: 1, userId: 1, status: 'pending' }
      ];
      DB.getOrders.mockResolvedValue(mockOrders);

      const res = await request(app)
        .get('/orders')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
    });

    test('should return 401 without token', async () => {
      const res = await request(app).get('/orders');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /orders', () => {
    test('should create new order successfully', async () => {
      const newOrder = {
        pizzaId: 1,
        size: 'medium',
        toppings: ['cheese', 'pepperoni']
      };

      DB.createOrder.mockResolvedValue({ id: 1, ...newOrder });
      DB.getUserById.mockResolvedValue({ id: 1, role: 'user' });

      const res = await request(app)
        .post('/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send(newOrder);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    test('should return 400 for invalid order data', async () => {
      const res = await request(app)
        .post('/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ size: 'invalid' });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /orders/:id', () => {
    test('should return specific order for admin', async () => {
      const mockOrder = { id: 1, userId: 2, status: 'pending' };
      DB.getOrder.mockResolvedValue(mockOrder);

      const res = await request(app)
        .get('/orders/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('id', 1);
    });

    test('should return 404 for non-existent order', async () => {
      DB.getOrder.mockResolvedValue(null);

      const res = await request(app)
        .get('/orders/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /orders/:id', () => {
    test('should update order successfully', async () => {
      const updatedOrder = {
        status: 'completed',
        size: 'large'
      };

      DB.getOrder.mockResolvedValue({ id: 1, userId: 1, status: 'pending' });
      DB.updateOrder.mockResolvedValue({ id: 1, ...updatedOrder });

      const res = await request(app)
        .put('/orders/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatedOrder);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('status', 'completed');
    });
  });

  describe('DELETE /orders/:id', () => {
    test('should delete order successfully', async () => {
      DB.getOrder.mockResolvedValue({ id: 1, userId: 1 });
      DB.deleteOrder.mockResolvedValue(true);

      const res = await request(app)
        .delete('/orders/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(204);
    });

    test('should return 404 for non-existent order', async () => {
      DB.getOrder.mockResolvedValue(null);

      const res = await request(app)
        .delete('/orders/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });
  });
});
