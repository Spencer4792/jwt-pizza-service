const { Role } = require('../../src/model/model');

describe('Model', () => {
  describe('Role', () => {
    it('should define correct role constants', () => {
      expect(Role.Diner).toBe('diner');
      expect(Role.Franchisee).toBe('franchisee');
      expect(Role.Admin).toBe('admin');
    });

    it('should contain only the expected roles', () => {
      const expectedRoles = ['Diner', 'Franchisee', 'Admin'];
      const actualRoles = Object.keys(Role);
      expect(actualRoles.sort()).toEqual(expectedRoles.sort());
    });

    it('should have correct string values for roles', () => {
      expect(Role.Diner).toBe('diner');
      expect(Role.Franchisee).toBe('franchisee');
      expect(Role.Admin).toBe('admin');
    });
  });
});