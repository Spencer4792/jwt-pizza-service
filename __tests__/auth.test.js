const request = require('supertest');
const express = require('express');
const authRouter = require('../src/routes/authRouter');
const database = require('../src/database/database');

const app = express();
app.use(express.json());
app.use('/auth', authRouter);

describe('Auth Endpoints', () => {
  beforeAll(async () => {
    // Setup database connection
    await database.connect();
  });

  afterAll(async () => {
    // Close database connection
    await database.close();
  });

  test('login should return 401 for invalid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        username: 'nonexistentuser',
        password: 'wrongpassword'
      });
    expect(res.statusCode).toBe(401);
  });

  test('register should return 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        username: 'testuser'
        // missing password
      });
    expect(res.statusCode).toBe(400);
  });
});
