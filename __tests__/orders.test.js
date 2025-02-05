const request = require('supertest');
const express = require('express');
const orderRouter = require('../src/routes/orderRouter');
const database = require('../src/database/database');
const jwt = require('jsonwebtoken');
const config = require('../src/config');

const app = express();
app.use(express.json());
app.use('/orders', orderRouter);

describe('Order Endpoints', () => {
  let authToken;

  beforeAll(async () => {
    await database.connect();
    // Create a test token
    authToken = jwt.sign({ userId: 1, role: 'user' }, config.jwtSecret);
  });

  afterAll(async () => {
    await database.close();
  });

  test('GET /orders should require authentication', async () => {
    const res = await request(app).get('/orders');
    expect(res.statusCode).toBe(401);
  });

  test('GET /orders should return orders with valid token', async () => {
    const res = await request(app)
      .get('/orders')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBeTruthy();
  });

  test('POST /orders should create new order', async () => {
    const res = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        pizzaId: 1,
        size: 'medium',
        toppings: ['cheese', 'pepperoni']
      });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('orderId');
  });
});
