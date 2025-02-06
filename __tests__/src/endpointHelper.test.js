const { asyncHandler, StatusCodeError } = require('../../src/endpointHelper');

describe('EndpointHelper', () => {
  describe('StatusCodeError', () => {
    it('should create error with status code', () => {
      const error = new StatusCodeError('Test error', 400);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error instanceof Error).toBe(true);
    });

    it('should preserve stack trace', () => {
      const error = new StatusCodeError('Test error', 400);
      expect(error.stack).toBeDefined();
    });
  });

  describe('asyncHandler', () => {
    it('should handle successful async operations', async () => {
      const mockReq = {};
      const mockRes = {
        json: jest.fn(),
      };
      const mockNext = jest.fn();

      const handler = asyncHandler(async (req, res) => {
        res.json({ success: true });
      });

      await handler(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle errors and pass them to next', async () => {
      const mockReq = {};
      const mockRes = {};
      const mockNext = jest.fn();

      const handler = asyncHandler(async () => {
        throw new Error('Async error');
      });

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockNext.mock.calls[0][0].message).toBe('Async error');
    });

    it('should handle StatusCodeError', async () => {
      const mockReq = {};
      const mockRes = {};
      const mockNext = jest.fn();

      const handler = asyncHandler(async () => {
        throw new StatusCodeError('Bad request', 400);
      });

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockNext.mock.calls[0][0].statusCode).toBe(400);
      expect(mockNext.mock.calls[0][0].message).toBe('Bad request');
    });

    it('should handle synchronous operations', async () => {
      const mockReq = {};
      const mockRes = {
        json: jest.fn(),
      };
      const mockNext = jest.fn();

      const handler = asyncHandler((req, res) => {
        res.json({ success: true });
      });

      await handler(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});