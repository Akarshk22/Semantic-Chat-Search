/**
 * Temporal expression parser.
 * Converts natural-language time expressions into [start, end] Date ranges,
 * relative to a reference date.
 */

const MONTH_MAP = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEK_ORDINALS = {
  first: 1, "1st": 1,
  second: 2, "2nd": 2,
  third: 3, "3rd": 3,
  fourth: 4, "4th": 4,
  last: 4
};

const SEASON_MONTHS = {
  summer: [3, 7],   // April (3) to August (7)
  monsoon: [5, 8],  // June (5) to September (8)
  winter: [10, 1],  // November (10) to February (1)
  spring: [2, 4],   // March (2) to May (4)
  fall: [8, 10],    // September (8) to November (10)
  autumn: [8, 10]
};

function monthRange(year, monthIdx) {
  const start = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0));
  // Last day of month
  const end = new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59, 999));
  return [start, end];
}

/**
 * Try to extract a date range from query text.
 * Returns { start, end, label } or null.
 * @param {string} text 
 * @param {Date} reference 
 */
export function parseTimeExpression(text, reference = new Date()) {
  const t = text.toLowerCase().trim();
  const refYear = reference.getUTCFullYear();
  const refMonth = reference.getUTCMonth();

  // 1. "between June 10 and June 20"
  const betweenMatch = t.match(/between\s+([a-z]+)\s+(\d{1,2})\s+and\s+([a-z]*)\s*(\d{1,2})/i);
  if (betweenMatch) {
    const m1 = MONTH_MAP[betweenMatch[1]];
    const d1 = parseInt(betweenMatch[2], 10);
    const m2 = betweenMatch[3] ? MONTH_MAP[betweenMatch[3]] : m1;
    const d2 = parseInt(betweenMatch[4], 10);
    if (m1 !== undefined && m2 !== undefined) {
      const start = new Date(Date.UTC(refYear, m1, d1, 0, 0, 0));
      const end = new Date(Date.UTC(refYear, m2, d2, 23, 59, 59, 999));
      const label = `${d1} ${MONTH_NAMES[m1].slice(0, 3)} – ${d2} ${MONTH_NAMES[m2].slice(0, 3)} ${refYear}`;
      return { start, end, label };
    }
  }

  // 2. "last month"
  if (/\blast\s+month\b/i.test(t)) {
    const prevMonthIdx = refMonth === 0 ? 11 : refMonth - 1;
    const prevYear = refMonth === 0 ? refYear - 1 : refYear;
    const [start, end] = monthRange(prevYear, prevMonthIdx);
    return { start, end, label: `${MONTH_NAMES[prevMonthIdx]} ${prevYear}` };
  }

  // 3. "this month"
  if (/\bthis\s+month\b/i.test(t)) {
    const [start, end] = monthRange(refYear, refMonth);
    return { start, end, label: `${MONTH_NAMES[refMonth]} ${refYear}` };
  }

  // 4. "last week"
  if (/\blast\s+week\b/i.test(t)) {
    const dayOfWeek = reference.getUTCDay(); // 0 is Sun
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const mondayThis = new Date(reference);
    mondayThis.setUTCDate(reference.getUTCDate() - distanceToMonday);

    const mondayLast = new Date(mondayThis);
    mondayLast.setUTCDate(mondayThis.getUTCDate() - 7);
    mondayLast.setUTCHours(0, 0, 0, 0);

    const sundayLast = new Date(mondayLast);
    sundayLast.setUTCDate(mondayLast.getUTCDate() + 6);
    sundayLast.setUTCHours(23, 59, 59, 999);

    return {
      start: mondayLast,
      end: sundayLast,
      label: `Week of ${mondayLast.getUTCDate()} ${MONTH_NAMES[mondayLast.getUTCMonth()].slice(0, 3)} ${mondayLast.getUTCFullYear()}`
    };
  }

  // 5. "this week"
  if (/\bthis\s+week\b/i.test(t)) {
    const dayOfWeek = reference.getUTCDay();
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(reference);
    monday.setUTCDate(reference.getUTCDate() - distanceToMonday);
    monday.setUTCHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);

    return {
      start: monday,
      end: sunday,
      label: `Week of ${monday.getUTCDate()} ${MONTH_NAMES[monday.getUTCMonth()].slice(0, 3)} ${monday.getUTCFullYear()}`
    };
  }

  // 6. "yesterday"
  if (/\byesterday\b/i.test(t)) {
    const yest = new Date(reference);
    yest.setUTCDate(reference.getUTCDate() - 1);
    const start = new Date(Date.UTC(yest.getUTCFullYear(), yest.getUTCMonth(), yest.getUTCDate(), 0, 0, 0));
    const end = new Date(Date.UTC(yest.getUTCFullYear(), yest.getUTCMonth(), yest.getUTCDate(), 23, 59, 59, 999));
    return { start, end, label: `${yest.getUTCDate()} ${MONTH_NAMES[yest.getUTCMonth()].slice(0, 3)} ${yest.getUTCFullYear()}` };
  }

  // 7. "today"
  if (/\btoday\b/i.test(t)) {
    const start = new Date(Date.UTC(refYear, refMonth, reference.getUTCDate(), 0, 0, 0));
    const end = new Date(Date.UTC(refYear, refMonth, reference.getUTCDate(), 23, 59, 59, 999));
    return { start, end, label: `${reference.getUTCDate()} ${MONTH_NAMES[refMonth].slice(0, 3)} ${refYear}` };
  }

  // 8. "around the second week of June"
  const weekOrdinalMatch = t.match(/(?:around\s+)?the\s+(first|second|third|fourth|last|\d(?:st|nd|rd|th)?)\s+week\s+of\s+([a-z]+)/i);
  if (weekOrdinalMatch) {
    const weekN = WEEK_ORDINALS[weekOrdinalMatch[1].toLowerCase()] || 1;
    const monthIdx = MONTH_MAP[weekOrdinalMatch[2].toLowerCase()];
    if (monthIdx !== undefined) {
      const dayStart = (weekN - 1) * 7 + 1;
      const dayEnd = Math.min(weekN * 7, 28);
      const start = new Date(Date.UTC(refYear, monthIdx, dayStart, 0, 0, 0));
      const end = new Date(Date.UTC(refYear, monthIdx, dayEnd, 23, 59, 59, 999));
      return { start, end, label: `Week ${weekN} of ${MONTH_NAMES[monthIdx]} ${refYear}` };
    }
  }

  // 9. "in June", "around July", "in August 2026"
  const monthMatch = t.match(/(?:\bin\b|\baround\b)\s+([a-z]+)(?:\s+(\d{4}))?/i);
  if (monthMatch) {
    const monthIdx = MONTH_MAP[monthMatch[1].toLowerCase()];
    if (monthIdx !== undefined) {
      const y = monthMatch[2] ? parseInt(monthMatch[2], 10) : refYear;
      const [start, end] = monthRange(y, monthIdx);
      return { start, end, label: `${MONTH_NAMES[monthIdx]} ${y}` };
    }
  }

  // 10. Seasons (summer, monsoon, etc.)
  for (const [season, [sm, em]] of Object.entries(SEASON_MONTHS)) {
    const regex = new RegExp(`\\b${season}\\b`, 'i');
    if (regex.test(t)) {
      const start = new Date(Date.UTC(refYear, sm, 1, 0, 0, 0));
      let end;
      if (em < sm) {
        end = new Date(Date.UTC(refYear + 1, em + 1, 0, 23, 59, 59, 999));
      } else {
        [, end] = monthRange(refYear, em);
      }
      return {
        start,
        end,
        label: season.charAt(0).toUpperCase() + season.slice(1)
      };
    }
  }

  // 11. "earlier this year"
  if (/earlier\s+this\s+year/i.test(t)) {
    const start = new Date(Date.UTC(refYear, 0, 1, 0, 0, 0));
    const end = new Date(Date.UTC(refYear, refMonth, 0, 23, 59, 59, 999));
    return {
      start,
      end,
      label: `Jan – ${MONTH_NAMES[refMonth - 1]} ${refYear}`
    };
  }

  return null;
}

/**
 * Score how well a message's timestamp falls within [start, end].
 * Returns 1.0 if within range, decaying linearly outside (up to 30 days away -> 0).
 * @param {Date} msgTs 
 * @param {Date} start 
 * @param {Date} end 
 * @returns {number}
 */
export function temporalScore(msgTs, start, end) {
  const tsTime = msgTs.getTime();
  const startTime = start.getTime();
  const endTime = end.getTime();

  if (tsTime >= startTime && tsTime <= endTime) {
    return 1.0;
  }

  let deltaMs = 0;
  if (tsTime < startTime) {
    deltaMs = startTime - tsTime;
  } else {
    deltaMs = tsTime - endTime;
  }

  const decayMs = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
  const score = Math.max(0.0, 1.0 - deltaMs / decayMs);
  return Number(score.toFixed(4));
}
