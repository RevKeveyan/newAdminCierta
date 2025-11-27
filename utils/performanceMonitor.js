const fs = require('fs');
const path = require('path');

class PerformanceMonitor {
  constructor() {
    this.metrics = [];
    this.slowThreshold = 1000; // 1 second
    this.verySlowThreshold = 5000; // 5 seconds
  }

  /**
   * Start timing a request
   */
  startTiming(req) {
    req.startTime = Date.now();
    req.performanceId = Math.random().toString(36).substr(2, 9);
  }

  /**
   * End timing and log performance
   */
  endTiming(req, res) {
    if (!req.startTime) return;

    const duration = Date.now() - req.startTime;
    const metric = {
      id: req.performanceId,
      method: req.method,
      url: req.originalUrl,
      duration: duration,
      timestamp: new Date().toISOString(),
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      statusCode: res.statusCode
    };

    this.metrics.push(metric);

    // Log slow requests
    if (duration > this.slowThreshold) {
      const level = duration > this.verySlowThreshold ? '🚨 VERY SLOW' : '⚠️ SLOW';
      console.warn(`${level}: ${req.method} ${req.originalUrl} took ${duration}ms`);
      
      // Log additional details for very slow requests
      if (duration > this.verySlowThreshold) {
        console.warn(`   User-Agent: ${req.get('User-Agent')}`);
        console.warn(`   IP: ${req.ip || req.connection.remoteAddress}`);
        console.warn(`   Status: ${res.statusCode}`);
        console.warn(`   Body size: ${JSON.stringify(req.body || {}).length} bytes`);
      }
    }

    // Add response header
    res.set('X-Response-Time', `${duration}ms`);
    res.set('X-Performance-ID', req.performanceId);

    // Keep only last 1000 metrics to prevent memory issues
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  /**
   * Get performance statistics
   */
  getStats() {
    if (this.metrics.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        slowRequests: 0,
        verySlowRequests: 0
      };
    }

    const totalRequests = this.metrics.length;
    const totalTime = this.metrics.reduce((sum, metric) => sum + metric.duration, 0);
    const averageResponseTime = Math.round(totalTime / totalRequests);
    
    const slowRequests = this.metrics.filter(m => m.duration > this.slowThreshold).length;
    const verySlowRequests = this.metrics.filter(m => m.duration > this.verySlowThreshold).length;

    return {
      totalRequests,
      averageResponseTime,
      slowRequests,
      verySlowRequests,
      slowPercentage: Math.round((slowRequests / totalRequests) * 100),
      verySlowPercentage: Math.round((verySlowRequests / totalRequests) * 100)
    };
  }

  /**
   * Get slowest requests
   */
  getSlowestRequests(limit = 10) {
    return this.metrics
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get requests by endpoint
   */
  getRequestsByEndpoint() {
    const endpointStats = {};
    
    this.metrics.forEach(metric => {
      const key = `${metric.method} ${metric.url}`;
      if (!endpointStats[key]) {
        endpointStats[key] = {
          count: 0,
          totalTime: 0,
          slowCount: 0
        };
      }
      
      endpointStats[key].count++;
      endpointStats[key].totalTime += metric.duration;
      if (metric.duration > this.slowThreshold) {
        endpointStats[key].slowCount++;
      }
    });

    // Calculate averages
    Object.keys(endpointStats).forEach(key => {
      const stats = endpointStats[key];
      stats.averageTime = Math.round(stats.totalTime / stats.count);
      stats.slowPercentage = Math.round((stats.slowCount / stats.count) * 100);
    });

    return endpointStats;
  }

  /**
   * Export metrics to file
   */
  exportMetrics(filename = null) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = filename || `performance-metrics-${timestamp}.json`;
    const filePath = path.join(__dirname, '../logs', file);

    // Ensure logs directory exists
    const logsDir = path.dirname(filePath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const data = {
      timestamp: new Date().toISOString(),
      stats: this.getStats(),
      slowestRequests: this.getSlowestRequests(20),
      requestsByEndpoint: this.getRequestsByEndpoint(),
      allMetrics: this.metrics
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`📊 Performance metrics exported to: ${filePath}`);
    
    return filePath;
  }

  /**
   * Clear metrics
   */
  clearMetrics() {
    this.metrics = [];
    console.log('🧹 Performance metrics cleared');
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = performanceMonitor;






















