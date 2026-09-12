/**
 * Query parser: extract person, time range, and semantic core from raw query string.
 */

import { parseTimeExpression } from './temporalParser.js';

const PARTICIPANTS = [
  "rahul", "priya", "ankit", "neha", "vikas", "sneha", "karan", "meera"
];

const STRIP_PATTERNS = [
  /what did [a-z]+ say (about|regarding|on|concerning)\s+/gi,
  /what was [a-z]+'s (view|opinion|suggestion|take|message) (on|about|regarding)\s+/gi,
  /what did [a-z]+ (mention|suggest|ask|tell|write|post)\s*/gi,
  /what did (we|the group|everyone|they) (discuss|decide|talk about|plan)\s*/gi,
  /(did|what) (priya|rahul|ankit|neha|vikas|sneha|karan|meera)\s+(say|mention|suggest|write)\s*/gi,
  /\b(what|when|where|why|who|how)\b\s+/gi,
  /\b(did|was|were|is|are|has|have)\b\s+/gi,
  /\b(the|a|an|we|they|our|their)\b\s+/gi
];

function extractPerson(text) {
  const tl = text.toLowerCase();
  for (const name of PARTICIPANTS) {
    const reg = new RegExp(`\\b${name}\\b`, 'i');
    if (reg.test(tl)) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return null;
}

function stripConstraints(text, person) {
  let result = text;
  if (person) {
    const reg = new RegExp(`\\b${person}\\b`, 'gi');
    result = result.replace(reg, ' ');
  }

  for (const pattern of STRIP_PATTERNS) {
    result = result.replace(pattern, ' ');
  }

  result = result.replace(/\s+/g, ' ').trim();
  return result || text;
}

/**
 * Parse a raw user query string.
 * @param {string} text 
 * @param {Date} referenceDate 
 * @returns {{ person: string|null, timeRange: object|null, semanticQuery: string, queryType: string }}
 */
export function parseQuery(text, referenceDate = new Date()) {
  const person = extractPerson(text);
  const timeRange = parseTimeExpression(text, referenceDate);

  let queryType = 'semantic';
  if (person && timeRange) {
    queryType = 'mixed';
  } else if (person) {
    queryType = 'person';
  } else if (timeRange) {
    queryType = 'time';
  }

  const semanticQuery = stripConstraints(text, person);

  return {
    person,
    timeRange,
    semanticQuery,
    queryType
  };
}
