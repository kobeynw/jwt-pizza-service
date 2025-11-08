const config = require('./config');
const os = require('os');

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

// Metrics stored in memory
const requests = {};
let activeUsers = 0;
let pizzasSold = 0;
let purchaseFailures = 0;
let revenue = 0;
let authSuccesses = 0;
let authFailures = 0;
let reqLatencies = [];
let pizzaCreationLatencies = [];

// Middleware to track requests
function requestTracker(req, res, next) {
  const endpoint = `${req.method}`;
  requests[endpoint] = (requests[endpoint] || 0) + 1;
  next();
}

// Functions to track active users and authentication
function incrementActiveUsers() {
  activeUsers += 1;
  authSuccesses += 1;
}

function decrementActiveUsers() {
  activeUsers -= 1;
}

function incrementAuthFailures() {
  authFailures += 1;
}

// Functions to track pizza transactions
function pizzaTransaction(successful, price=0) {
  if (successful) {
    pizzasSold += 1;
    revenue += price;
  } else {
    purchaseFailures += 1;
  }
}

// Functions to track latency
function requestLatency(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const end = Date.now();
    reqLatencies.push(end - start);
  });
  next();
}

function pizzaCreationLatency(latency) {
  pizzaCreationLatencies.push(latency);
}

// This will periodically send metrics to Grafana
setInterval(() => {
  const metrics = [];

  // Add request metrics
  Object.keys(requests).forEach((endpoint) => {
    metrics.push(createMetric('requests', requests[endpoint], '1', 'sum', 'asInt', { endpoint }));
  });

  // Add CPU metrics
  metrics.push(createMetric('cpuUsage', getCpuUsagePercentage(), '%', 'gauge', 'asDouble', {}));
  metrics.push(createMetric('memoryUsage', getMemoryUsagePercentage(), '%', 'gauge', 'asDouble', {}));

  // Add active users metrics
  metrics.push(createMetric('activeUsers', activeUsers, '1', 'sum', 'asInt', {}));

  // Add pizza transaction metrics
  metrics.push(createMetric('pizzasSold', pizzasSold, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('purchaseFailures', purchaseFailures, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('revenue', revenue, '1', 'sum', 'asDouble', {}));

  // Add auth success/failure metrics
  metrics.push(createMetric('authSuccesses', authSuccesses, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('authFailures', authFailures, '1', 'sum', 'asInt', {}));

  // Add latency metrics
  if (reqLatencies.length > 0) {
    const maxLatency = Math.max(...reqLatencies);
    metrics.push(createMetric('reqLatency', maxLatency, '1', 'sum', 'asDouble', {}));
    reqLatencies = [];
  }
  if (pizzaCreationLatencies.length > 0) {
    const maxLatency = Math.max(...pizzaCreationLatencies);
    metrics.push(createMetric('pizzaCreationLatency', maxLatency, '1', 'sum', 'asDouble', {}));
    pizzaCreationLatencies = [];
  }

  sendMetricToGrafana(metrics);
}, 10000);

function createMetric(metricName, metricValue, metricUnit, metricType, valueType, attributes) {
  attributes = { ...attributes, source: config.metrics.source };

  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: metricValue,
          timeUnixNano: Date.now() * 1000000,
          attributes: [],
        },
      ],
    },
  };

  Object.keys(attributes).forEach((key) => {
    metric[metricType].dataPoints[0].attributes.push({
      key: key,
      value: { stringValue: attributes[key] },
    });
  });

  if (metricType === 'sum') {
    metric[metricType].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

function sendMetricToGrafana(metrics) {
  const body = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ],
  };

  fetch(`${config.metrics.url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${config.metrics.apiKey}`, 'Content-Type': 'application/json' },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error);
    });
}

module.exports = {
  requestTracker,
  incrementActiveUsers,
  decrementActiveUsers,
  incrementAuthFailures,
  pizzaTransaction,
  requestLatency,
  pizzaCreationLatency,
};