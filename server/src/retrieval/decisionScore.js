/**
 * Decision-signal scorer.
 * Detects whether a message contains decision-like language in
 * English or Hinglish/Hindi (Roman script).
 */

const DECISION_PHRASES = [
  // English
  "final",
  "done",
  "fixed",
  "decided",
  "locked",
  "confirmed",
  "confirm",
  "settled",
  "agreed",
  "let's do",
  "lets do",
  "go with",
  "proceed",
  "booked",
  "book kar",
  "approved",
  // Hinglish
  "pakka",
  "pakka hai",
  "fix hai",
  "final hai",
  "final karte",
  "kar lete",
  "kar liya",
  "ho gaya",
  "haan bhai",
  "chal",
  "chalo",
  "toh",
  "theek hai",
  "bas",
  "set hai",
  "done hai",
  "confirmed hai",
  "reservation",
  "book"
];

// Sort by length descending for regex matching
const sortedPhrases = [...DECISION_PHRASES].sort((a, b) => b.length - a.length);
const escaped = sortedPhrases.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const DECISION_REGEX = new RegExp(`(?<!\\w)(${escaped.join('|')})(?!\\w)`, 'gi');

/**
 * Return a score in [0, 1] indicating how decision-like the message is.
 * Higher = more signals of a concrete decision / commitment.
 * @param {string} text 
 * @returns {number}
 */
export function decisionScore(text) {
  if (!text || typeof text !== 'string') return 0.0;
  const trimmed = text.trim();
  if (!trimmed) return 0.0;

  const matches = trimmed.match(DECISION_REGEX);
  if (!matches || matches.length === 0) return 0.0;

  const unique = new Set(matches.map(m => m.toLowerCase()));
  const raw = unique.size;
  const score = Math.min(1.0, 0.4 + (raw - 1) * 0.2);
  return Number(score.toFixed(4));
}
