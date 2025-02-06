const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { authRouter, setAuthUser } = require('../../src/routes/authRouter');
const { DB, Role } = require('../../src/database/database');
const config = require('../../src/config');

// Mock the database module
jest.mock('../../src/database/database', () => ({
  DB: {
    addUser: jest.fn(),
    getUser: jest.fn(),
    loginUser: jest.fn(),
    logoutUser: jest.fn(),
    isLoggedIn: jest.fn(),
    updateUser: jest.fn(),
  },
  Role: {
    Diner: 'diner',
    Franchisee: 'franchisee',
    Admin: 'admin',
  },
}));

describe('Auth Router', () => {
  let app;
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Create a new Express app for each test
    app = express();
    app.use(express.json());
    app.use(setAuthUser);
    app.use('/api/auth', authRouter);
  });

  describe('setAuthUser middleware', () => {
    it('should handle invalid token format', async () => {
      const invalidToken = 'invalid.token.format';
      DB.isLoggedIn.mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/auth')
        .set('Authorization', `Bearer ${invalidToken}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('unauthorized');
    });

    it('should handle token verification failure', async () => {
      const token = jwt.sign({ id: 1 }, 'wrong-secret');
      DB.isLoggedIn.mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/auth')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('unauthorized');
    });

    it('should handle database token validation failure', async () => {
      const token = jwt.sign({ id: 1 }, config.jwtSecret);
      DB.isLoggedIn.mockResolvedValue(false);

      const response = await request(app)
        .delete('/api/auth')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('unauthorized');
    });

    it('should handle missing authorization header', async () => {
      const response = await request(app)
        .delete('/api/auth');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('unauthorized');
    });
  });

  describe('POST /api/auth (Register)', () => {
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: 1,
        name: 'Test User',
        email: 'test@test.com',
        roles: [{ role: Role.Diner }],
      };

      DB.addUser.mockResolvedValue(mockUser);
      DB.loginUser.mockResolvedValue();

      const response = await request(app)
        .post('/api/auth')
        .send({
          name: 'Test User',
          email: 'test@test.com',
          password: 'password123',
        });

      expect(response.status).toBe(200);
      expect(response.body.user).toEqual(mockUser);
      expect(response.body.token).toBeTruthy();
      expect(DB.addUser).toHaveBeenCalled();
      expect(DB.loginUser).toHaveBeenCalled();
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/auth')
        .send({
          email: 'test@test.com',
          // Missing name and password
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('name, email, and password are required');
    });
  });

  describe('PUT /api/auth (Login)', () => {
    it('should login an existing user successfully', async () => {
      const mockUser = {
        id: 1,
        name: 'Test User',
        email: 'test@test.com',
        roles: [{ role: Role.Diner }],
      };

      DB.getUser.mockResolvedValue(mockUser);
      DB.loginUser.mockResolvedValue();

      const response = await request(app)
        .put('/api/auth')
        .send({
          email: 'test@test.com',
          password: 'password123',
        });

      expect(response.status).toBe(200);
      expect(response.body.user).toEqual(mockUser);
      expect(response.body.token).toBeTruthy();
      expect(DB.getUser).toHaveBeenCalledWith('test@test.com', 'password123');
      expect(DB.loginUser).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/auth (Logout)', () => {
    it('should logout a user successfully', async () => {
      const token = jwt.sign({ id: 1 }, config.jwtSecret);
      DB.isLoggedIn.mockResolvedValue(true);
      DB.logoutUser.mockResolvedValue();

      const response = await request(app)
        .delete('/api/auth')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('logout successful');
      expect(DB.logoutUser).toHaveBeenCalledWith(token);
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .delete('/api/auth');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('unauthorized');
    });

    it('should handle empty authorization header', async () => {
        const response = await request(app)
          .delete('/api/auth')
          .set('Authorization', '');  // Empty authorization header
    
        expect(response.status).toBe(401);
        expect(response.body.message).toBe('unauthorized');
      });
    
      it('should handle malformed authorization header', async () => {
        const response = await request(app)
          .delete('/api/auth')
          .set('Authorization', 'Bearer');  // Malformed header without token
    
        expect(response.status).toBe(401);
        expect(response.body.message).toBe('unauthorized');
      });
  });

  describe('PUT /api/auth/:userId (Update User)', () => {
    it('should update user if authorized (same user)', async () => {
      const mockUser = {
        id: 1,
        name: 'Test User',
        email: 'test@test.com',
        roles: [{ role: Role.Diner }],
      };

      const token = jwt.sign(mockUser, config.jwtSecret);
      DB.isLoggedIn.mockResolvedValue(true);
      DB.updateUser.mockResolvedValue(mockUser);

      const response = await request(app)
        .put('/api/auth/1')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'new@test.com',
          password: 'newpassword',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockUser);
      expect(DB.updateUser).toHaveBeenCalledWith(1, 'new@test.com', 'newpassword');
    });

    it('should update user if authorized (admin)', async () => {
      const adminUser = {
        id: 1,
        name: 'Admin',
        email: 'admin@test.com',
        roles: [{ role: Role.Admin }],
      };

      const token = jwt.sign(adminUser, config.jwtSecret);
      DB.isLoggedIn.mockResolvedValue(true);
      DB.updateUser.mockResolvedValue({ id: 2, name: 'Other User' });

      const response = await request(app)
        .put('/api/auth/2')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'new@test.com',
          password: 'newpassword',
        });

      expect(response.status).toBe(200);
    });

    it('should return 403 if user tries to update another user without admin role', async () => {
      const mockUser = {
        id: 1,
        name: 'Test User',
        email: 'test@test.com',
        roles: [{ role: Role.Diner }],
      };

      const token = jwt.sign(mockUser, config.jwtSecret);
      DB.isLoggedIn.mockResolvedValue(true);

      const response = await request(app)
        .put('/api/auth/2')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'new@test.com',
          password: 'newpassword',
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('unauthorized');
    });
  });
});