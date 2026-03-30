#!/usr/bin/env node

/**
 * Script to fix notification token mismatch
 * Automatically syncs token from notifications/.env to server/.env
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
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
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return null;
  }
}

function writeEnvFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing file:', error);
    return false;
  }
}

function parseEnvFile(content) {
  const env = {};
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
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
        env[key] = { value, lineIndex: index, originalLine: line };
      }
    }
  });
  
  return { env, lines };
}

function main() {
  log('\n🔧 Fixing Notification Token Configuration...\n', 'cyan');

  const serverEnvPath = path.join(__dirname, '../.env');
  const notificationsEnvPath = path.join(__dirname, '../../notifications/.env');

  // Read .env files
  const serverEnvContent = readEnvFile(serverEnvPath);
  const notificationsEnvContent = readEnvFile(notificationsEnvPath);

  if (!serverEnvContent) {
    log(`❌ server/.env file not found at: ${serverEnvPath}`, 'red');
    return;
  }

  if (!notificationsEnvContent) {
    log(`❌ notifications/.env file not found at: ${notificationsEnvPath}`, 'red');
    return;
  }

  // Parse env files
  const serverParsed = parseEnvFile(serverEnvContent);
  const notificationsParsed = parseEnvFile(notificationsEnvContent);

  // Get tokens
  const serverToken = serverParsed.env.NOTIFICATION_INTERNAL_TOKEN?.value || 
                      serverParsed.env.INTERNAL_TOKEN?.value || 
                      serverParsed.env.INTERNAL_API_TOKEN?.value;
  
  const notificationsToken = notificationsParsed.env.NOTIFICATION_INTERNAL_TOKEN?.value || 
                              notificationsParsed.env.INTERNAL_TOKEN?.value || 
                              notificationsParsed.env.INTERNAL_API_TOKEN?.value;

  if (!notificationsToken) {
    log('❌ Token not found in notifications/.env', 'red');
    return;
  }

  // Trim tokens
  const serverTokenTrimmed = serverToken ? String(serverToken).trim() : null;
  const notificationsTokenTrimmed = String(notificationsToken).trim();

  if (serverTokenTrimmed === notificationsTokenTrimmed) {
    log('✅ Tokens already match! No fix needed.', 'green');
    return;
  }

  log('🔍 Found token mismatch:', 'yellow');
  log(`   Server token length: ${serverTokenTrimmed?.length || 0}`, 'yellow');
  log(`   Notifications token length: ${notificationsTokenTrimmed.length}`, 'yellow');
  log(`   Server token preview: ${serverTokenTrimmed ? serverTokenTrimmed.substring(0, 8) + '...' + serverTokenTrimmed.substring(serverTokenTrimmed.length - 8) : 'N/A'}`, 'yellow');
  log(`   Notifications token preview: ${notificationsTokenTrimmed.substring(0, 8)}...${notificationsTokenTrimmed.substring(notificationsTokenTrimmed.length - 8)}`, 'yellow');

  log('\n🔧 Fixing server/.env...', 'cyan');

  // Find which token variable to update
  const tokenKey = serverParsed.env.NOTIFICATION_INTERNAL_TOKEN ? 'NOTIFICATION_INTERNAL_TOKEN' :
                   serverParsed.env.INTERNAL_TOKEN ? 'INTERNAL_TOKEN' :
                   serverParsed.env.INTERNAL_API_TOKEN ? 'INTERNAL_API_TOKEN' :
                   'NOTIFICATION_INTERNAL_TOKEN'; // Default

  // Update or add token
  const tokenEntry = serverParsed.env[tokenKey];
  const newLine = `${tokenKey}=${notificationsTokenTrimmed}`;

  let newContent = serverEnvContent;
  
  if (tokenEntry) {
    // Replace existing line
    const lines = newContent.split('\n');
    lines[tokenEntry.lineIndex] = newLine;
    newContent = lines.join('\n');
    log(`   Updated ${tokenKey} on line ${tokenEntry.lineIndex + 1}`, 'green');
  } else {
    // Add new line at the end
    newContent = newContent.trim() + '\n' + newLine + '\n';
    log(`   Added ${tokenKey} at the end of file`, 'green');
  }

  // Also update INTERNAL_TOKEN if it exists and is different
  if (serverParsed.env.INTERNAL_TOKEN && serverParsed.env.INTERNAL_TOKEN.value !== notificationsTokenTrimmed) {
    const lines = newContent.split('\n');
    const internalTokenEntry = serverParsed.env.INTERNAL_TOKEN;
    lines[internalTokenEntry.lineIndex] = `INTERNAL_TOKEN=${notificationsTokenTrimmed}`;
    newContent = lines.join('\n');
    log(`   Also updated INTERNAL_TOKEN on line ${internalTokenEntry.lineIndex + 1}`, 'green');
  }

  // Write updated content
  if (writeEnvFile(serverEnvPath, newContent)) {
    log('\n✅ Successfully fixed server/.env!', 'green');
    log('   Token now matches notifications/.env', 'green');
    log('\n⚠️  IMPORTANT: Restart the server for changes to take effect!', 'yellow');
    log('   Run: npm start (or restart your server process)', 'yellow');
  } else {
    log('\n❌ Failed to write server/.env', 'red');
    log('   Please fix manually by removing the extra "0" at the end of the token', 'yellow');
  }

  log('\n');
}

main();
