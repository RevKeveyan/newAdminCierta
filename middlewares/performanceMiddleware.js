const performanceMonitor = require('../utils/performanceMonitor');

const performanceMiddleware = (req, res, next) => {
  // Start timing
  performanceMonitor.startTiming(req);
  
  // Override res.end to measure response time
  const originalEnd = res.end;
  res.end = function(...args) {
    // End timing and log performance
    performanceMonitor.endTiming(req, res);
    
    // Call original end
    originalEnd.apply(this, args);
  };
  
  next();
};

module.exports = performanceMiddleware;




