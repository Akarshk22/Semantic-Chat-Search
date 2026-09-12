/**
 * Synthetic Group-Chat Corpus Generator in JavaScript.
 * Generates 4,200+ messages across 6 months with 8 participants and 3 decision threads.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const OUT_PATH = path.join(rootDir, 'data', 'messages.json');
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

const PARTICIPANTS = ["Rahul", "Priya", "Ankit", "Neha", "Vikas", "Sneha", "Karan", "Meera"];

// Pre-defined key messages (stable ground-truth IDs)
const KEY_MESSAGES = [
  // Trip to Manali
  { id: "msg_D001", timestamp: "2026-08-18T09:42:00", sender: "Rahul", text: "haan bhai Manali final karte hain, 18th ko nikalte", conversation_id: "trip_manali", message_type: "text" },
  { id: "msg_D002", timestamp: "2026-08-15T20:15:00", sender: "Priya", text: "18th August se 22nd, 4 raat ka plan pakka karte hain", conversation_id: "trip_manali", message_type: "text" },
  { id: "msg_D003", timestamp: "2026-07-20T21:30:00", sender: "Ankit", text: "overnight Volvo bus le lete hain, 1400 per head aayega, AC comfortable", conversation_id: "trip_manali", message_type: "text" },
  { id: "msg_D004", timestamp: "2026-08-17T14:22:00", sender: "Vikas", text: "Zostel Manali dono rooms confirm kar diye, 2800 per night total split mein", conversation_id: "trip_manali", message_type: "text" },
  { id: "msg_D005", timestamp: "2026-08-12T19:45:00", sender: "Priya", text: "okay total 12k per head max, travel sab milake, isse zyada nahi", conversation_id: "trip_manali", message_type: "text" },
  { id: "msg_D010", timestamp: "2026-08-10T18:30:00", sender: "Neha", text: "yaar 15k se zyada nahi ho sakta, seedha bol deta hoon tight hai wallet", conversation_id: "trip_manali", message_type: "text" },
  { id: "msg_D011", timestamp: "2026-05-14T11:20:00", sender: "Rahul", text: "Rishikesh idea drop karo, last time bahut crowded tha aur ganda bhi", conversation_id: "trip_manali", message_type: "text" },
  { id: "msg_D012", timestamp: "2026-05-20T16:45:00", sender: "Ankit", text: "bhai Goa July mein bahut rain hoga, monsoon avoid karo yaar", conversation_id: "trip_manali", message_type: "text" },

  // Birthday Restaurant
  { id: "msg_D006", timestamp: "2026-07-10T19:30:00", sender: "Priya", text: "Pyaar restaurant confirm hai, Saturday 8 baje reservation fix", conversation_id: "birthday_restaurant", message_type: "text" },
  { id: "msg_D007", timestamp: "2026-07-11T12:05:00", sender: "Sneha", text: "table book kar diya, 8 seater, Priya ke naam pe, yay!", conversation_id: "birthday_restaurant", message_type: "text" },
  { id: "msg_D014", timestamp: "2026-07-08T15:20:00", sender: "Priya", text: "Olive Garden booking cancel, too expensive for 8 log yaar, 4k per head ho jata", conversation_id: "birthday_restaurant", message_type: "text" },

  // Tech Stack
  { id: "msg_D008", timestamp: "2026-04-10T15:30:00", sender: "Karan", text: "React aur Node final, client ne bhi approve kar diya, shuru karte hain", conversation_id: "project_techstack", message_type: "text" },
  { id: "msg_D009", timestamp: "2026-04-12T10:00:00", sender: "Meera", text: "3 hafte mein MVP deliver, deadline October 5th, resources plan karo", conversation_id: "project_techstack", message_type: "text" },
  { id: "msg_D013", timestamp: "2026-04-08T14:10:00", sender: "Vikas", text: "Vue chhodo yaar, team mein koi jaanta nahi theek se, unnecessary risk", conversation_id: "project_techstack", message_type: "text" },
  { id: "msg_D015", timestamp: "2026-04-09T16:45:00", sender: "Karan", text: "Angular mat lo, learning curve bahut zyada hai timeline ke liye", conversation_id: "project_techstack", message_type: "text" }
];

const FILLER_PHRASES = [
  "haan bhai", "theek hai", "done", "okay", "sahi hai", "chalte hain", "kya scene hai?",
  "bhai sun sun sun", "lol", "hahaha", "arre yaar", "acha suno", "kya chal raha hai",
  "Reacted to your message", "kal milte hain", "lunch kahan karein?", "coffee peene chalein?",
  "main late ho jaunga", "reached office", "call me when free", "check this out",
  "mast hai", "awesome", "perfect!", "let me check and confirm", "bhai suno ek baat",
  "yes +1", "totally agree", "not sure yaar", "so jao sab", "good morning guys", "gn"
];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

export function generateDataset(targetCount = 4200) {
  // If messages.json already exists and satisfies count, keep it
  if (fs.existsSync(OUT_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
      if (existing.length >= targetCount) {
        console.log(`Preserving existing ${existing.length} messages in data/messages.json.`);
        return existing;
      }
    } catch (e) {
      // regenerate if corrupt
    }
  }

  console.log(`Generating synthetic corpus with ${targetCount} messages...`);
  const messages = [...KEY_MESSAGES];

  const startDate = new Date(Date.UTC(2026, 2, 1, 9, 0, 0)); // Mar 1, 2026
  const endDate = new Date(Date.UTC(2026, 7, 31, 23, 59, 59)); // Aug 31, 2026

  let count = messages.length;
  while (count < targetCount) {
    count++;
    const sender = randomChoice(PARTICIPANTS);
    const ts = randomDate(startDate, endDate).toISOString().slice(0, 19);
    const text = randomChoice(FILLER_PHRASES);
    const msgType = Math.random() < 0.05 ? "reaction" : "text";

    messages.push({
      id: `msg_${String(count).padStart(6, '0')}`,
      timestamp: ts,
      sender,
      text,
      conversation_id: "general",
      message_type: msgType
    });
  }

  messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  fs.writeFileSync(OUT_PATH, JSON.stringify(messages, null, 2));
  console.log(`Generated and wrote ${messages.length} messages to data/messages.json.`);
  return messages;
}

if (process.argv[1] && process.argv[1].endsWith('generateData.js')) {
  generateDataset(4200);
}
