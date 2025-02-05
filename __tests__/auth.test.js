const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const config = require('../src/config');
const { authRouter } = require('../src/routes/authRouter');
const { DB } = require('../src/database/database');

// Mock the database calls
jest.mock('../src/database/database', () => ({
  DB: {
    getUserByUsername: jest.fn(),
    createUser: jest.fn(),
    getUserById: jest.fn()
  }
}));

const app = express();
app.use(express.json());
app.use('/auth', authRouter);

describe('Auth Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    test('should create new user successfully', async () => {
      const newUser = {
        username: 'newuser',
        password: 'password123',
      };

      DB.getUserByUsername.mockResolvedValue(null);
      DB.createUser.mockResolvedValue({ id: 1, ...newUser, role: 'user' });

      const res = await request(app)
        .post('/auth/register')
        .send(newUser);
      
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('token');
    });

    test('should return 400 for missing fields', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ username: 'testuser' });
      
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    test('should login successfully with correct credentials', async () => {
      const password = 'password123';
      const hashedPassword = await bcrypt.hash(password, 10);
      
      DB.getUserByUsername.mockResolvedValue({
        id: 1,
        username: 'testuser',
        password: hashedPassword,
        role: 'user'
      });

      const res = await request(app)
        .post('/auth/login')
        .send({
          username: 'testuser',
          password: password
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
    });
  });
});
