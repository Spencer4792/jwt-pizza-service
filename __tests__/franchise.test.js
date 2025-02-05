const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('./testConfig');
const franchiseRouter = require('../src/routes/franchiseRouter');
const { DB } = require('../src/database/database');

// Mock the database calls
jest.mock('../src/database/database', () => ({
  DB: {
    getFranchises: jest.fn(),
    getFranchise: jest.fn(),
    createFranchise: jest.fn(),
    updateFranchise: jest.fn(),
    deleteFranchise: jest.fn()
  },
}));

const app = express();
app.use(express.json());
app.use('/franchises', franchiseRouter);

describe('Franchise Endpoints', () => {
  let adminToken;

  beforeEach(() => {
    jest.clearAllMocks();
    adminToken = jwt.sign({ userId: 1, role: 'admin' }, config.jwtSecret);
  });

  describe('GET /franchises', () => {
    test('should return all franchises for admin', async () => {
      const mockFranchises = [
        { id: 1, name: 'Downtown Pizza', location: 'Downtown' },
        { id: 2, name: 'Uptown Pizza', location: 'Uptown' }
      ];
      DB.getFranchises.mockResolvedValue(mockFranchises);

      const res = await request(app)
        .get('/franchises')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      expect(res.body).toHaveLength(2);
    });

    test('should return 401 without token', async () => {
      const res = await request(app).get('/franchises');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /franchises', () => {
    test('should create new franchise successfully', async () => {
      const newFranchise = {
        name: 'New Pizza Place',
        location: 'Midtown',
        phone: '123-456-7890'
      };

      DB.createFranchise.mockResolvedValue({ id: 1, ...newFranchise });

      const res = await request(app)
        .post('/franchises')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newFranchise);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    test('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/franchises')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Incomplete Franchise' });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /franchises/:id', () => {
    test('should return specific franchise', async () => {
      const mockFranchise = { id: 1, name: 'Test Franchise', location: 'Test Location' };
      DB.getFranchise.mockResolvedValue(mockFranchise);

      const res = await request(app)
        .get('/franchises/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('id', 1);
    });

    test('should return 404 for non-existent franchise', async () => {
      DB.getFranchise.mockResolvedValue(null);

      const res = await request(app)
        .get('/franchises/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /franchises/:id', () => {
    test('should update franchise successfully', async () => {
      const updatedFranchise = {
        name: 'Updated Pizza Place',
        location: 'New Location'
      };

      DB.getFranchise.mockResolvedValue({ id: 1, name: 'Old Name', location: 'Old Location' });
      DB.updateFranchise.mockResolvedValue({ id: 1, ...updatedFranchise });

      const res = await request(app)
        .put('/franchises/1')
        .set('Authorization', `Bearer ${adminToken}`)
