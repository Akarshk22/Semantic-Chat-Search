/**
 * Data loader service: reads messages and test queries from JSON.
 */

import fs from 'fs';

export function loadMessages(messagesPath) {
  if (!fs.existsSync(messagesPath)) {
    throw new Error(`Messages file not found: ${messagesPath}`);
  }
  const raw = fs.readFileSync(messagesPath, 'utf8');
  const messages = JSON.parse(raw);
  
  // Sort chronologically
  messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return messages;
}

export function loadQueries(queriesPath) {
  if (!fs.existsSync(queriesPath)) {
    throw new Error(`Queries file not found: ${queriesPath}`);
  }
  const raw = fs.readFileSync(queriesPath, 'utf8');
  return JSON.parse(raw);
}
