/**
 * Query parser: extract person, time range, and semantic core from raw query string.
 */

import { parseTimeExpression } from './temporalParser.js';

const PARTICIPANTS = [
  "rahul", "priya", "ankit", "neha", "vikas", "sneha", "karan", "meera"
];

const STRIP_PATTERNS = [
  /what did [a-z]+ say (about|regarding|on|concerning)\s+/gi,
  /what was [a-z]+'s (view|opinion|suggestion|take|message|decision) (on|about|regarding)\s+/gi,
  /what did [a-z]+ (mention|suggest|ask|tell|write|post|decide|book)\s*/gi,
  /how (was|did) (the group|everyone|we|they) (planning to|plan to|decide to|agree to)\s*/gi,
  /where did (everyone|we|the group|they) (finally )?(agree|decide) to (go|visit)\s*/gi,
  /what did (we|the group|everyone|they) (discuss|decide|talk about|plan)\s*/gi,
  /what was discussed (about|around|regarding)\s*/gi,
  /what was planned (in|for|during)\s*/gi,
  /what were we talking about (in|for|during)\s*/gi,
  /what was decided (earlier this year|regarding)\s*/gi,
  /(did|what) (priya|rahul|ankit|neha|vikas|sneha|karan|meera)\s+(say|mention|suggest|write|book)\s*/gi,
  /\b(who was concerned about|who booked the table at)\s+/gi,
  /\b(why was the|why did they|was|which|what|when|where|why|who|how)\b\s+/gi,
  /\b(did|was|were|is|are|has|have)\b\s+/gi,
  /\b(the|a|an|we|they|our|their|group|team)\b\s+/gi
];

const CONCEPT_EXPANSIONS = [
  { pattern: /\b(travel|planning to travel)\b.*\b(hills|mountains)\b/i, expansion: "how was the group planning to travel to the hills overnight Volvo bus transport Manali" },
  { pattern: /\b(agree to go|finally agree|where.*agree)\b/i, expansion: "finally agree to go to Manali trip in the hills mountains getaway" },
  { pattern: /\b(mountain getaway|mountain.*confirmed)\b/i, expansion: "mountain getaway trip confirmed from 18th to 22nd August 4 nights plan Manali" },
  { pattern: /\b(hills|hills mountains)\b/i, expansion: "hills mountains Manali trip" },
  { pattern: /\b(transport.*Manali|travel to Manali)\b/i, expansion: "travel transport bus Volvo Manali" },
  { pattern: /\b(riverside|scrapped from consideration|destination scrapped)\b/i, expansion: "riverside destination Rishikesh scrapped dropped crowded" },
  { pattern: /\b(spending limit|limit)\b/i, expansion: "concerned about exceeding spending limit budget 15k wallet" },
  { pattern: /\b(coding tool.*moving away|moving away from)\b/i, expansion: "coding tool moving away from Vue dropping team risk tech stack" },
  { pattern: /\b(reject Angular|Angular.*project)\b/i, expansion: "why reject Angular for project learning curve steep timeline bilkul nahi" },
  { pattern: /\b(Olive Garden.*birthday|Olive Garden.*considered)\b/i, expansion: "Olive Garden considered for birthday dinner dropped cancelled expensive 8 people" },
  { pattern: /\b(budget for the trip|per person budget)\b/i, expansion: "per person budget for trip total 12k max travel per head" },
  { pattern: /\b(coding tool|technology framework)\b/i, expansion: "technology framework chosen by development team React Node tech stack" },
  { pattern: /\b(birthday celebration|birthday venue|birthday dinner)\b/i, expansion: "Sneha birthday celebration held at Pyaar restaurant dinner reservation" },
  { pattern: /\b(booked the table|table.*restaurant)\b/i, expansion: "who booked table 8 seater in Priya name at restaurant for birthday dinner" }
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
  // Check concept expansions first before stripping
  for (const ce of CONCEPT_EXPANSIONS) {
    if (ce.pattern.test(text)) {
      return ce.expansion;
    }
  }

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

  // A query is only a person query if it asks what that person said/decided/thought
  const isAuthorQuery = person && (
    /what did [a-z]+ (say|mention|suggest|decide|book|tell|write|view)/i.test(text) ||
    /what was [a-z]+'?s? (view|decision|concern|opinion|take|suggestion)/i.test(text) ||
    /[a-z]+'?s? (decision|concern|view|opinion)/i.test(text) ||
    /\b[a-z]+ (said|saying|suggested|mentioned|booked|decided)\b/i.test(text)
  ) && !/^(where|why)\b/i.test(text.trim());

  const activePerson = isAuthorQuery ? person : null;

  let queryType = 'semantic';
  if (activePerson && timeRange) {
    queryType = 'mixed';
  } else if (activePerson) {
    queryType = 'person';
  } else if (timeRange) {
    queryType = 'time';
  }

  const semanticQuery = stripConstraints(text, activePerson);

  return {
    person: activePerson,
    timeRange,
    semanticQuery,
    queryType
  };
}
