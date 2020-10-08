// See: https://github.com/facebook/jest/issues/9983

const Environment = require('jest-environment-jsdom');

module.exports = class CustomTestEnvironment extends Environment {
  /**
   *
   */
  async setup() {
    await super.setup();
    if (typeof this.global.TextEncoder === 'undefined') {
      const { TextEncoder } = require('util');
      this.global.TextEncoder = TextEncoder;
    }
  }
};
