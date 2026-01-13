const fs = require('fs');
const path = require('path');

const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
const logsDir = isVercel 
  ? path.join('/tmp', 'logs')
  : path.join(__dirname, '..', 'logs');

if (!fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create logs directory:', error.message);
  }
}

function getLogFileName() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return path.join(logsDir, `order-${year}-${month}-${day}.log`);
}

function formatTimestamp() {
  const date = new Date();
  return date.toISOString();
}

function writeLog(level, section, data) {
  try {
    const logFile = getLogFileName();
    const timestamp = formatTimestamp();
    const logEntry = {
      timestamp,
      level,
      section,
      data
    };
    
    const logLine = JSON.stringify(logEntry, null, 2) + '\n' + '='.repeat(80) + '\n\n';
    fs.appendFileSync(logFile, logLine, 'utf8');
  } catch (error) {
    console.error('Failed to write log:', error.message);
    const timestamp = formatTimestamp();
    const logEntry = {
      timestamp,
      level,
      section,
      data
    };
    console.log(JSON.stringify(logEntry, null, 2));
  }
}

const logger = {
  shopify: (data) => {
    writeLog('INFO', 'SHOPIFY_ORDER', data);
  },
  
  address: (data) => {
    writeLog('INFO', 'DELIVERY_ADDRESS', data);
  },
  
  crmRequest: (data) => {
    writeLog('INFO', 'CRM_REQUEST', data);
  },
  
  crmResponse: (data) => {
    writeLog('INFO', 'CRM_RESPONSE', data);
  },
  
  error: (section, error) => {
    writeLog('ERROR', section, {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });
  }
};

module.exports = logger;

