const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { authRouter, setAuthUser } = require('../src/routes/authRouter');
const { DB } = require('../src/database/database');

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashedPassword'),
  compare: jest.fn().mockResolvedValue(true)
}));

// Mock the database calls
jest.mock('../src/database/database', () => ({
  DB: {
    addUser: jest.fn(),
    getUser: jest.fn(),
    updateUser: jest.fn(),
    loginUser: jest.fn(),
    logoutUser: jest.fn(),
    isLoggedIn: jest.fn(),
    Role: {
      Diner: 'diner',
      Admin: 'admin'
    }
  }
}));

const app = express();
app.use(express.json());
app.use(setAuthUser);
app.use('/', authRouter);

describe('Auth Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DB.isLoggedIn.mockResolvedValue(true);
  });

  describe('POST / (Register)', () => {
    test('should create new user successfully', async () => {
      const newUser = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      };

      const mockUser = {
        id: 1,
        name: newUser.name,
        email: newUser.email,
        roles: [{ role: 'diner' }]
      };

      DB.addUser.mockResolvedValue(mockUser);
      DB.loginUser.mockResolvedValue();

      const res = await request(app)
        .post('/')
        .send(newUser);

      expect(DB.addUser).toHaveBeenCalledWith(expect.objectContaining({
        name: newUser.name,
        email: newUser.email,
        password: 'hashedPassword'
      }));
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('token');
    });

    test('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/')
        .send({});
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT / (Login)', () => {
    test('should login successfully', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const mockUser = {
        id: 1,
        name: 'Test User',
        email: loginData.email,
        roles: [{ role: 'diner' }]
      };

      DB.getUser.mockResolvedValue(mockUser);
      DB.loginUser.mockResolvedValue();

      const res = await request(app)
        .put('/')
        .send(loginData);

      expect(res.statusCode).toBe(200);
      expect(res.body.user).toEqual(mockUser);
      expect(res.body).toHaveProperty('token');
    });

    test('should return 401 for invalid credentials', async () => {
      bcrypt.compare.mockResolvedValueOnce(false);
      
      const res = await request(app)
        .put('/')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('PUT /:userId (Update)', () => {
    test('should update user successfully', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'admin' }], 
          isRole: (role) => role === 'admin' 
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      const mockUser = {
        id: 1,
        name: 'Updated User',
        email: 'updated@example.com'
      };

      DB.updateUser.mockResolvedValue(mockUser);
      DB.isLoggedIn.mockResolvedValue(true);

      const res = await request(app)
        .put('/1')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'updated@example.com',
          password: 'newpassword'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(mockUser);
    });

    test('should return 403 for unauthorized update', async () => {
      const token = jwt.sign(
        { 
          id: 2, 
          roles: [{ role: 'diner' }], 
          isRole: (role) => role === 'diner' 
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      const res = await request(app)
        .put('/1')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'updated@example.com'
        });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE / (Logout)', () => {
    test('should logout successfully', async () => {
      const token = jwt.sign(
        { 
          id: 1, 
          roles: [{ role: 'diner' }], 
          isRole: (role) => role === 'diner' 
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      DB.logoutUser.mockResolvedValue();
      DB.isLoggedIn.mockResolvedValue(true);

      const res = await request(app)
        .delete('/')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ message: 'logout successful' });
    });

    test('should return 401 for unauthorized logout', async () => {
      const res = await request(app)
        .delete('/');

      expect(res.statusCode).toBe(401);
    });
  });
});