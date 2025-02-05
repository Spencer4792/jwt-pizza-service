const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const { orderRouter } = require('../src/routes/orderRouter');
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
  }
}));

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (req.headers.authorization) {
    const token = req.headers.authorization.split(' ')[1];
    try {
      req.user = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  }
  next();
});
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
      
      DB.getUserById.mockResolvedValue({ id: 2, role: 'admin' });
      DB.getOrders.mockResolvedValue(mockOrders);

      const res = await request(app)
        .get('/orders')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
    });
  });

  describe('POST /orders', () => {
    test('should create new order successfully', async () => {
      const newOrder = {
        pizzaId: 1,
        size: 'medium',
        toppings: ['cheese']
      };

      DB.getUserById.mockResolvedValue({ id: 1, role: 'user' });
      DB.createOrder.mockResolvedValue({ id: 1, ...newOrder });

      const res = await request(app)
        .post('/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send(newOrder);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id');
    });
  });
});
