
const fetch = require('node-fetch');
const config = require('./config.js');
const logger = require('./logger.js');

/**
 * Helper for interacting with the Pizza Factory service
 */
class FactoryHelper {
  /**
   * Send an order to the factory service
   * @param {Object} order - The order details to send
   * @returns {Promise<Object>} Factory response
   */
  async sendOrder(order) {
    const url = `${config.factory.url}/orders`;
    const method = 'POST';
    const requestBody = order;
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.factory.apiKey
        },
        body: JSON.stringify(requestBody)
      });
      
      const responseBody = await response.json();
      
      // Log the factory service interaction
      logger.factoryLogger(method, url, requestBody, response.status, responseBody);
      
      return responseBody;
    } catch (error) {
      // Log any errors
      logger.log('error', 'factory', {
        method,
        url,
        requestBody: logger.sanitize(requestBody),
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Check the status of an order from the factory
   * @param {string} orderId - ID of the order to check
   * @returns {Promise<Object>} Order status details
   */
  async getOrderStatus(orderId) {
    const url = `${config.factory.url}/orders/${orderId}`;
    const method = 'GET';
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'x-api-key': config.factory.apiKey
        }
      });
      
      const responseBody = await response.json();
      
      // Log the factory service interaction
      logger.factoryLogger(method, url, null, response.status, responseBody);
      
      return responseBody;
    } catch (error) {
      // Log any errors
      logger.log('error', 'factory', {
        method,
        url,
        orderId,
        error: error.message
      });
      
      throw error;
    }
  }
}

module.exports = new FactoryHelper();