#!/usr/bin/env node

/**
 * Script to check if notification tokens are configured correctly
 * Compares tokens in server/.env and notifications/.env
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function readEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const env = {};
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          env[key] = value;
        }
      }
    });
    return env;
  } catch (error) {
    return null;
  }
}

function main() {
  log('\n🔍 Checking Notification Token Configuration...\n', 'cyan');

  const serverEnvPath = path.join(__dirname, '../.env');
  const notificationsEnvPath = path.join(__dirname, '../../notifications/.env');

  // Read .env files
  const serverEnv = readEnvFile(serverEnvPath);
  const notificationsEnv = readEnvFile(notificationsEnvPath);

  // Check if files exist
  if (!serverEnv) {
    log(`❌ server/.env file not found at: ${serverEnvPath}`, 'red');
    return;
  }

  if (!notificationsEnv) {
    log(`❌ notifications/.env file not found at: ${notificationsEnvPath}`, 'red');
    return;
  }

  // Get tokens from both files
  const serverToken = serverEnv.NOTIFICATION_INTERNAL_TOKEN || 
                      serverEnv.INTERNAL_TOKEN || 
                      serverEnv.INTERNAL_API_TOKEN;
  
  const notificationsToken = notificationsEnv.NOTIFICATION_INTERNAL_TOKEN || 
                              notificationsEnv.INTERNAL_TOKEN || 
                              notificationsEnv.INTERNAL_API_TOKEN;

  log('📋 Configuration Status:\n', 'blue');

  // Server token status
  if (serverToken) {
    log(`✅ server/.env: Token found (length: ${serverToken.length})`, 'green');
    log(`   Preview: ${serverToken.substring(0, 4)}...${serverToken.substring(serverToken.length - 4)}`, 'cyan');
  } else {
    log(`❌ server/.env: Token NOT found`, 'red');
    log(`   Set one of: NOTIFICATION_INTERNAL_TOKEN, INTERNAL_TOKEN, or INTERNAL_API_TOKEN`, 'yellow');
  }

  // Notifications token status
  if (notificationsToken) {
    log(`✅ notifications/.env: Token found (length: ${notificationsToken.length})`, 'green');
    log(`   Preview: ${notificationsToken.substring(0, 4)}...${notificationsToken.substring(notificationsToken.length - 4)}`, 'cyan');
  } else {
    log(`❌ notifications/.env: Token NOT found`, 'red');
    log(`   Set one of: NOTIFICATION_INTERNAL_TOKEN, INTERNAL_TOKEN, or INTERNAL_API_TOKEN`, 'yellow');
  }

  // Compare tokens
  log('\n🔐 Token Comparison:\n', 'blue');

  if (!serverToken || !notificationsToken) {
    log('❌ Cannot compare: One or both tokens are missing', 'red');
    return;
  }

  // Trim tokens for comparison
  const serverTokenTrimmed = serverToken.trim();
  const notificationsTokenTrimmed = notificationsToken.trim();

  if (serverTokenTrimmed === notificationsTokenTrimmed) {
    log('✅ Tokens MATCH! Configuration is correct.', 'green');
    log(`   Both tokens are identical (length: ${serverTokenTrimmed.length})`, 'green');
  } else {
    log('❌ Tokens DO NOT MATCH!', 'red');
    log(`   Server token length: ${serverTokenTrimmed.length}`, 'yellow');
    log(`   Notifications token length: ${notificationsTokenTrimmed.length}`, 'yellow');
    log(`   Server token: ${serverTokenTrimmed.substring(0, 8)}...${serverTokenTrimmed.substring(serverTokenTrimmed.length - 8)}`, 'yellow');
    log(`   Notifications token: ${notificationsTokenTrimmed.substring(0, 8)}...${notificationsTokenTrimmed.substring(notificationsTokenTrimmed.length - 8)}`, 'yellow');
    log('\n💡 Solution:', 'cyan');
    log('   1. Open both .env files', 'cyan');
    log('   2. Make sure NOTIFICATION_INTERNAL_TOKEN has the EXACT same value', 'cyan');
    log('   3. Check for extra spaces, quotes, or typos', 'cyan');
    log('   4. Restart both services after fixing', 'cyan');
  }

  log('\n');
}

main();
