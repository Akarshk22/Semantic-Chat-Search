"""Generate synthetic group-chat corpus with 4,200+ messages.

Key design:
- 8 participants with personalities
- 6 months: March 1 – August 31, 2026
- 3 long decision threads embedded naturally in the timeline
- Bulk filler messages across general topics
- Pre-assigned IDs for key decision messages (msg_D001–msg_D015)
- Hinglish + English, typos, media, reactions, one-word replies

Run:
    python scripts/generate_dataset.py
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta
from pathlib import Path

SEED = 42
random.seed(SEED)

OUT_PATH = Path("data/messages.json")
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

# ── Participants ──────────────────────────────────────────────────────────────
PARTICIPANTS = ["Rahul", "Priya", "Ankit", "Neha", "Vikas", "Sneha", "Karan", "Meera"]

# ── Pre-defined key messages (stable IDs) ────────────────────────────────────
# These are the ground-truth answers for evaluation queries.

KEY_MESSAGES = [
    # ─── Trip to Manali ──────────────────────────────────────────────────────
    dict(id="msg_D001", timestamp="2026-08-18T09:42:00", sender="Rahul",
         text="haan bhai Manali final karte hain, 18th ko nikalte",
         conversation_id="trip_manali", message_type="text"),
    dict(id="msg_D002", timestamp="2026-08-15T20:15:00", sender="Priya",
         text="18th August se 22nd, 4 raat ka plan pakka karte hain",
         conversation_id="trip_manali", message_type="text"),
    dict(id="msg_D003", timestamp="2026-07-20T21:30:00", sender="Ankit",
         text="overnight Volvo bus le lete hain, 1400 per head aayega, AC comfortable",
         conversation_id="trip_manali", message_type="text"),
    dict(id="msg_D004", timestamp="2026-08-17T14:22:00", sender="Vikas",
         text="Zostel Manali dono rooms confirm kar diye, 2800 per night total split mein",
         conversation_id="trip_manali", message_type="text"),
    dict(id="msg_D005", timestamp="2026-08-12T19:45:00", sender="Priya",
         text="okay total 12k per head max, travel sab milake, isse zyada nahi",
         conversation_id="trip_manali", message_type="text"),
    dict(id="msg_D010", timestamp="2026-08-11T20:10:00", sender="Neha",
         text="yaar 15k se zyada nahi ho sakta, seedha bol deta hoon tight hai wallet",
         conversation_id="trip_manali", message_type="text"),
    dict(id="msg_D011", timestamp="2026-05-12T22:05:00", sender="Rahul",
         text="Rishikesh idea drop karo, last time bahut crowded tha aur ganda bhi",
         conversation_id="trip_manali", message_type="text"),
    dict(id="msg_D012", timestamp="2026-05-14T20:30:00", sender="Ankit",
         text="bhai Goa July mein bahut rain hoga, monsoon avoid karo yaar",
         conversation_id="trip_manali", message_type="text"),

    # ─── Birthday Restaurant ─────────────────────────────────────────────────
    dict(id="msg_D006", timestamp="2026-07-05T15:30:00", sender="Priya",
         text="Pyaar restaurant confirm hai, Saturday 8 baje reservation fix",
         conversation_id="birthday_restaurant", message_type="text"),
    dict(id="msg_D007", timestamp="2026-07-05T16:45:00", sender="Sneha",
         text="table book kar diya, 8 seater, Priya ke naam pe, yay!",
         conversation_id="birthday_restaurant", message_type="text"),
    dict(id="msg_D014", timestamp="2026-07-03T19:20:00", sender="Priya",
         text="Olive Garden booking cancel, too expensive for 8 log yaar, 4k per person ho raha tha",
         conversation_id="birthday_restaurant", message_type="text"),

    # ─── Project Tech Stack ──────────────────────────────────────────────────
    dict(id="msg_D008", timestamp="2026-07-15T11:30:00", sender="Karan",
         text="React aur Node final, client ne bhi approve kar diya, shuru karte hain",
         conversation_id="project_techstack", message_type="text"),
    dict(id="msg_D009", timestamp="2026-07-15T12:00:00", sender="Meera",
         text="3 hafte mein MVP deliver, deadline October 5th, resources plan karo",
         conversation_id="project_techstack", message_type="text"),
    dict(id="msg_D013", timestamp="2026-07-12T22:45:00", sender="Vikas",
         text="Vue chhodo yaar, team mein koi jaanta nahi theek se, unnecessary risk",
         conversation_id="project_techstack", message_type="text"),
    dict(id="msg_D015", timestamp="2026-07-10T10:15:00", sender="Karan",
         text="Angular mat lo, learning curve bahut zyada hai timeline ke liye",
         conversation_id="project_techstack", message_type="text"),
]

# ── Trip thread context messages ──────────────────────────────────────────────

TRIP_THREAD = [
    # Phase 1: Destination debate (May 10–15)
    ("2026-05-10T19:00:00", "Priya", "guys trip plan karna hai, kahan jana chahte ho?"),
    ("2026-05-10T19:03:00", "Rahul", "Goa?"),
    ("2026-05-10T19:05:00", "Ankit", "Goa meh bahut gaya hoon yaar"),
    ("2026-05-10T19:07:00", "Neha", "mountains please, kuch fresh ho"),
    ("2026-05-10T19:10:00", "Vikas", "Manali? ya Rishikesh?"),
    ("2026-05-10T19:12:00", "Sneha", "Manali ka weather mast hota hai summer mein"),
    ("2026-05-10T19:15:00", "Karan", "Rishikesh is nice also, rafting wagera"),
    ("2026-05-10T19:18:00", "Meera", "haan rafting bhi ho sakti hai, but crowd??"),
    ("2026-05-11T08:30:00", "Rahul", "Rishikesh July mein bahut crowd hota hai bhai"),
    ("2026-05-11T08:35:00", "Priya", "sahi keh raha hai, last year gaye the bahut ganda tha"),
    ("2026-05-11T09:00:00", "Ankit", "toh Manali fix?"),
    ("2026-05-11T09:02:00", "Neha", "Manali +1"),
    ("2026-05-11T09:05:00", "Vikas", "but Goa ka vibe alag hota hai yaar"),
    ("2026-05-11T09:10:00", "Sneha", "Goa monsoon mein? nahi yaar"),
    ("2026-05-12T20:00:00", "Karan", "kab ka plan hai? June July August?"),
    ("2026-05-12T20:05:00", "Meera", "August better rahega, sab free honge"),
    ("2026-05-12T20:10:00", "Priya", "haan August makes sense"),
    ("2026-05-12T21:00:00", "Ankit", "Manali August mein weather kaisa hota hai?"),
    ("2026-05-12T21:15:00", "Sneha", "superb hota hai, 15-20 degree, bilkul mast"),
    ("2026-05-12T22:00:00", "Vikas", "Kedarnath bhi consider karo"),
    ("2026-05-12T22:03:00", "Rahul", "bhai bahut trek hai wahan, not everyone fit"),
    ("2026-05-12T22:08:00", "Neha", "trek nahi karni mujhe 😂"),
    ("2026-05-13T10:00:00", "Priya", "okay Manali vs Rishikesh, vote?"),
    ("2026-05-13T10:05:00", "Karan", "Manali"),
    ("2026-05-13T10:06:00", "Ankit", "Manali"),
    ("2026-05-13T10:07:00", "Neha", "Manali obviously"),
    ("2026-05-13T10:08:00", "Sneha", "Manali!! ❤️"),
    ("2026-05-13T10:09:00", "Meera", "Manali"),
    ("2026-05-13T10:10:00", "Vikas", "okay okay Manali it is"),
    # Phase 2: Dates (June)
    ("2026-06-01T19:30:00", "Priya", "okay bhai June already hai, dates fix karo trip ke"),
    ("2026-06-01T19:35:00", "Rahul", "August 15 ke aas paas? long weekend?"),
    ("2026-06-01T19:40:00", "Ankit", "15th national holiday hai, 16 17 18 long weekend ban sakta hai"),
    ("2026-06-01T19:45:00", "Neha", "mujhe office se leave leni padegi"),
    ("2026-06-01T20:00:00", "Vikas", "18th se 22nd kaise rahega?"),
    ("2026-06-01T20:05:00", "Sneha", "18-22 perfect lagta hai, 4 raat 5 din"),
    ("2026-06-01T20:10:00", "Karan", "mujhe 20th baad kaam hai, 22nd tak theek hai"),
    ("2026-06-01T20:15:00", "Meera", "18-22 +1"),
    ("2026-06-02T09:00:00", "Priya", "Rahul tu bhi 18-22 ke liye available hai?"),
    ("2026-06-02T09:10:00", "Rahul", "haan bhai 18-22 perfect hai, office se le lunga"),
    # Phase 3: Transport (July)
    ("2026-07-15T20:00:00", "Ankit", "yaar transport kaise karna hai Manali? train? bus? drive?"),
    ("2026-07-15T20:05:00", "Rahul", "drive karte hain, road trip!"),
    ("2026-07-15T20:10:00", "Priya", "bhai 2 cars chahiye honge, petrol bahut padhega"),
    ("2026-07-15T20:15:00", "Vikas", "Manali drive kaafi long hai yaar, 12-14 ghante"),
    ("2026-07-15T20:20:00", "Neha", "bus better hai, Volvo AC mein so ke jayenge"),
    ("2026-07-15T20:25:00", "Sneha", "overnight bus idea accha hai, time bhi bachega"),
    ("2026-07-15T21:00:00", "Karan", "train toh nahi jati directly, Chandigarh phir cab?"),
    ("2026-07-15T21:05:00", "Meera", "chandigarh se cab expensive padega for 8 log"),
    ("2026-07-16T08:30:00", "Ankit", "himachal tourism ki bus bhi hoti hai, cheap"),
    ("2026-07-16T08:35:00", "Rahul", "private Volvo better hai, AC, comfortable, overnight sone milta hai"),
    ("2026-07-16T09:00:00", "Priya", "HRTC vs private Volvo pricing check karo"),
    ("2026-07-16T10:00:00", "Vikas", "checked kiya, HRTC 800, Private Volvo 1400, difference 600 ka"),
    ("2026-07-16T10:05:00", "Neha", "600 ka difference worth hai comfort ke liye"),
    ("2026-07-16T10:10:00", "Sneha", "haan Volvo hi lena, overnight journey comfortable hogi"),
    ("2026-07-20T20:00:00", "Karan", "toh bus final? Delhi se overnight Volvo?"),
    ("2026-07-20T20:05:00", "Meera", "haan Volvo for sure"),
    ("2026-07-20T21:15:00", "Rahul", "okay Volvo bus confirm, Ankit book karega?"),
    ("2026-07-20T21:20:00", "Ankit", "haan main book karta hoon redbus se, seats pakad leta hoon"),
    # Phase 4: Hotel (August)
    ("2026-08-01T19:00:00", "Priya", "hotel ka kya scene hai?"),
    ("2026-08-01T19:05:00", "Vikas", "Zostel Manali kaafi accha hai, bunk beds, party vibe"),
    ("2026-08-01T19:10:00", "Neha", "Zostel? 8 log ek room mein? no thanks 😂"),
    ("2026-08-01T19:15:00", "Vikas", "private rooms bhi hote hain wahan, dono lenge"),
    ("2026-08-01T19:20:00", "Sneha", "Zostel ka rooftop view bahut accha hai, insta worthy 😄"),
    ("2026-08-01T20:00:00", "Karan", "budget check karo pehle, hotel pe kitna spend karna hai?"),
    ("2026-08-01T20:05:00", "Meera", "per room per night 1400-1500 accha rahega"),
    ("2026-08-01T20:10:00", "Rahul", "Zostel check kiya, 2 rooms available, 18-22 August"),
    ("2026-08-01T20:15:00", "Ankit", "book karo jaldi, August mein full ho jaata hai Manali"),
    ("2026-08-10T21:00:00", "Vikas", "okay bhai Zostel available hai, confirm karna hai?"),
    ("2026-08-10T21:05:00", "Priya", "haan confirm karo, link share karo payment ke liye"),
    ("2026-08-11T10:00:00", "Neha", "ek kaam karo, sab apna share dede Vikas ko, woh book karega"),
    ("2026-08-11T19:00:00", "Karan", "payment bhej diya Vikas ko"),
    ("2026-08-11T19:30:00", "Meera", "mera bhi bheja"),
    ("2026-08-12T09:00:00", "Sneha", "mera bhi transfer kar diya"),
    ("2026-08-12T18:00:00", "Rahul", "okay sab ka payment aa gaya?"),
    ("2026-08-12T18:05:00", "Vikas", "haan sab ka aa gaya, booking kar deta hoon"),
    # Final confirmation
    ("2026-08-17T10:00:00", "Ankit", "guys kuch aur confirm karna hai? snacks? packing?"),
    ("2026-08-17T10:05:00", "Priya", "warm clothes pakna, raat ko thanda hota hai wahan"),
    ("2026-08-17T10:10:00", "Neha", "medicine bhi rakhna, altitude sickness"),
    ("2026-08-17T10:15:00", "Sneha", "portable charger, camera, everything?"),
    ("2026-08-17T22:00:00", "Karan", "bhai kal niklenge, excited!"),
    ("2026-08-17T22:05:00", "Meera", "haan!! finally"),
    ("2026-08-17T22:10:00", "Vikas", "sab ka bags pack ho gaya?"),
    ("2026-08-18T08:00:00", "Priya", "subah uthna mat bhoolna, 10 baje milte hain station pe"),
    ("2026-08-18T09:00:00", "Ankit", "haan haan ready hoon, uber book kiya"),
    ("2026-08-18T09:30:00", "Neha", "nikal rahi hoon ghar se"),
    ("2026-08-18T09:38:00", "Sneha", "Manali mein kya kya karenge??"),
    # msg_D001 here at 09:42
    ("2026-08-18T09:45:00", "Priya", "done! chalo sab"),
    ("2026-08-18T09:47:00", "Neha", "so excited!!"),
    ("2026-08-18T09:50:00", "Vikas", "tickets kal tak book kar lete hain, Ankit?"),
    ("2026-08-18T09:55:00", "Karan", "Ankit pehle se book kar chuka hai yaar 😂"),
    ("2026-08-18T10:00:00", "Meera", "chalo bhai, Manali we are coming! ❤️"),
]

# ── Restaurant thread context messages ────────────────────────────────────────

RESTAURANT_THREAD = [
    ("2026-06-15T20:00:00", "Sneha", "guys meri birthday aa rahi hai July mein, plans?"),
    ("2026-06-15T20:05:00", "Priya", "birthday!! kahan celebrate karna hai?"),
    ("2026-06-15T20:10:00", "Rahul", "dinner out? koi accha restaurant?"),
    ("2026-06-15T20:15:00", "Ankit", "Olive Garden sunna hai, nice ambiance"),
    ("2026-06-15T20:20:00", "Neha", "haan Olive Garden bahut accha hai, been there"),
    ("2026-06-15T20:25:00", "Vikas", "koi Indian bhi consider karo yaar"),
    ("2026-06-15T20:30:00", "Karan", "Pyaar restaurant try kiya hai kisi ne?"),
    ("2026-06-15T20:35:00", "Meera", "Pyaar is nice, good food, decent price"),
    ("2026-06-16T10:00:00", "Sneha", "Olive Garden ka menu check kiya, quite expensive"),
    ("2026-06-16T10:05:00", "Priya", "kitna?"),
    ("2026-06-16T10:10:00", "Sneha", "2500-3000 per person min, 8 log matlab 20k+"),
    ("2026-06-16T10:15:00", "Rahul", "bhai thoda zyada hai"),
    ("2026-06-16T10:20:00", "Ankit", "Pyaar ka pricing check karo"),
    ("2026-06-16T10:30:00", "Meera", "Pyaar mein 1200-1500 per person, quite reasonable"),
    ("2026-06-16T10:35:00", "Vikas", "Pyaar +1 from me"),
    ("2026-06-20T19:00:00", "Priya", "okay options: Olive Garden, Pyaar, or somewhere else?"),
    ("2026-06-20T19:05:00", "Neha", "Pyaar vote from me, pricing better hai"),
    ("2026-06-20T19:10:00", "Karan", "Pyaar accha hai, been there twice, food quality top notch"),
    ("2026-06-20T19:15:00", "Sneha", "oka fine Pyaar! budget friendly and good"),
    ("2026-06-20T19:20:00", "Rahul", "Pyaar +1"),
    ("2026-06-20T19:25:00", "Ankit", "Pyaar it is"),
    ("2026-06-25T15:00:00", "Priya", "Pyaar mein reservation karni padegi weekend ke liye"),
    ("2026-06-25T15:05:00", "Sneha", "haan, Saturday July 5th?"),
    ("2026-06-25T15:10:00", "Priya", "perfect, Saturday July 5, 8 baje?"),
    ("2026-06-25T15:15:00", "Meera", "+1"),
    ("2026-06-25T15:20:00", "Vikas", "+1"),
    ("2026-06-25T15:25:00", "Karan", "haan Saturday 8pm done"),
    ("2026-06-25T15:30:00", "Rahul", "+1 Saturday"),
    ("2026-07-01T11:00:00", "Priya", "Pyaar mein call kiya, table available hai Saturday ko"),
    ("2026-07-01T11:05:00", "Sneha", "yay!! book karo please"),
    ("2026-07-01T11:10:00", "Ankit", "Priya book kar do, tere naam pe reservation"),
    ("2026-07-02T14:00:00", "Neha", "koi Olive Garden ke baare mein puch raha tha, cancel?"),
    ("2026-07-03T09:00:00", "Vikas", "Saturday confirm hai na? July 5th, Pyaar?"),
    ("2026-07-03T09:05:00", "Priya", "haan confirm, 8pm table for 8"),
    # msg_D014 Olive Garden cancel at 19:20
    ("2026-07-03T20:00:00", "Karan", "okay Pyaar sorted!"),
    ("2026-07-04T18:00:00", "Meera", "kal birthday girl ki shaam! Sneha ready?"),
    ("2026-07-04T18:05:00", "Sneha", "so so excited!! ❤️❤️"),
    ("2026-07-05T10:00:00", "Rahul", "aaj Sneha ki birthday!! 🎂"),
    ("2026-07-05T10:05:00", "Ankit", "Happy Birthday Sneha!! 🎉"),
    ("2026-07-05T10:06:00", "Neha", "HBD Sneha!! 🎂🎉"),
    ("2026-07-05T10:07:00", "Vikas", "Happy birthday Sneha! party tonight!"),
    ("2026-07-05T10:08:00", "Karan", "Birthday queen!! 👑"),
    ("2026-07-05T10:09:00", "Meera", "HBD!! Can't wait for tonight!"),
    # msg_D006 confirm at 15:30
    # msg_D007 booking at 16:45
    ("2026-07-05T18:00:00", "Rahul", "nikal raha hoon 7:30 baje"),
    ("2026-07-05T19:30:00", "Ankit", "Uber mein hoon, 15 min mein"),
    ("2026-07-05T21:00:00", "Priya", "[Image omitted]"),
    ("2026-07-05T21:01:00", "Meera", "OMG you all look amazing!!"),
    ("2026-07-05T22:30:00", "Sneha", "best birthday ever 🥹❤️ thank you all"),
]

# ── Project tech stack thread context messages ─────────────────────────────────

PROJECT_THREAD = [
    ("2026-04-01T10:00:00", "Karan", "guys ek freelance project mila hai, web app, team chahiye"),
    ("2026-04-01T10:05:00", "Meera", "kya project hai?"),
    ("2026-04-01T10:10:00", "Karan", "e-commerce dashboard, client hai Pune ka, 3 month timeline"),
    ("2026-04-01T10:15:00", "Vikas", "nice! stack kya use karna hai?"),
    ("2026-04-01T10:20:00", "Karan", "abhi soch raha hoon, React ya Vue?"),
    ("2026-04-01T10:30:00", "Meera", "React prefer karunga, zyada familiar hoon"),
    ("2026-04-01T10:35:00", "Vikas", "Vue bhi consider karo, simpler hai beginners ke liye"),
    ("2026-04-01T11:00:00", "Karan", "backend mein kya? Node? Python?"),
    ("2026-04-01T11:05:00", "Meera", "Node better hai for JS stack, consistency"),
    ("2026-04-01T11:10:00", "Vikas", "Python FastAPI bhi fast hai, team ko aata hai?"),
    ("2026-04-05T09:00:00", "Karan", "client se baat ki, React prefer karte hain woh bhi"),
    ("2026-04-05T09:05:00", "Meera", "great, React toh decide hai phir"),
    ("2026-04-05T09:10:00", "Vikas", "Angular consider kiya? more structured for large apps"),
    ("2026-04-05T09:15:00", "Karan", "Angular ka kya?"),
    ("2026-04-05T09:20:00", "Meera", "Angular complex hai, learning curve bahut zyada, team adjust nahi kar paayegi"),
    ("2026-04-05T09:25:00", "Vikas", "sahi keh rahi ho, timeline tight hai"),
    ("2026-04-10T15:00:00", "Karan", "okay backend mein Node vs Python, final decision?"),
    ("2026-04-10T15:05:00", "Meera", "Node prefer, JS stack pura consistent rahega"),
    ("2026-04-10T15:10:00", "Vikas", "Node +1, ek hi language frontend backend"),
    ("2026-04-20T11:00:00", "Karan", "guys timeline kya set karein?"),
    ("2026-04-20T11:05:00", "Meera", "MVP 3 hafte mein, phir iterations"),
    ("2026-04-20T11:10:00", "Vikas", "3 hafte tight hai, 4 better rahega"),
    ("2026-04-20T11:15:00", "Karan", "client chahta hai October 5 tak, kuch na kuch dikhana hai"),
    ("2026-05-01T10:00:00", "Meera", "database kya use karein?"),
    ("2026-05-01T10:05:00", "Karan", "MongoDB ya PostgreSQL?"),
    ("2026-05-01T10:10:00", "Vikas", "PostgreSQL better for structured e-commerce data"),
    ("2026-05-01T10:15:00", "Meera", "haan relational data ke liye SQL hi better hai"),
    ("2026-06-01T09:00:00", "Karan", "guys progress check karte hain, UI wireframes ready hain?"),
    ("2026-06-01T09:05:00", "Meera", "haan Figma mein done, client ko share kiya tha"),
    ("2026-06-01T09:10:00", "Vikas", "client ka feedback?"),
    ("2026-06-01T09:15:00", "Karan", "mostly positive, thodi changes chahiye"),
    ("2026-07-01T10:00:00", "Karan", "team, stack finalize karna hai abhi, coding shuru karna hai"),
    ("2026-07-01T10:05:00", "Meera", "React + Node already decide tha na?"),
    ("2026-07-01T10:10:00", "Vikas", "Vue wala option phir se sochein?"),
    ("2026-07-01T10:15:00", "Karan", "nahi yaar, React hi pakka, client bhi chahta hai"),
    ("2026-07-10T09:00:00", "Meera", "Angular topic phir koi uthao mat, already decided"),
    ("2026-07-10T09:05:00", "Vikas", "okay React but main phir bhi Vue kehta 😂"),
    # msg_D015 Angular rejection at 10:15
    ("2026-07-10T10:20:00", "Meera", "exactly, React hi final"),
    ("2026-07-12T20:00:00", "Karan", "Vue ka kya? koi strongly feel karta hai Vue ke liye?"),
    ("2026-07-12T20:05:00", "Meera", "nahi yaar, React theek hai"),
    # msg_D013 Vue rejection at 22:45
    ("2026-07-13T09:00:00", "Karan", "okay theek hai, React final, I'll confirm with client"),
    ("2026-07-14T11:00:00", "Karan", "client se baat ki, React approve hua"),
    ("2026-07-14T11:05:00", "Meera", "yay!! ab shuru karte hain"),
    ("2026-07-14T11:10:00", "Vikas", "Node bhi confirm hua?"),
    ("2026-07-14T11:15:00", "Karan", "haan Node bhi client approved, stack final"),
    # msg_D008 final at 11:30
    # msg_D009 timeline at 12:00
    ("2026-07-15T13:00:00", "Vikas", "chalo shuru karte hain, GitHub repo create karo"),
    ("2026-07-15T13:05:00", "Meera", "haan, Karan owner hoga repo ka"),
    ("2026-07-15T14:00:00", "Karan", "repo created, invites bheje hain"),
    ("2026-07-15T14:05:00", "Vikas", "joined!"),
    ("2026-07-15T14:06:00", "Meera", "joined, let's go! 🚀"),
]

# ── Filler message templates ──────────────────────────────────────────────────

MORNING_GREETINGS = [
    "good morning guys", "good morning!!", "gm", "morning yaar", "uthh gaye sab?",
    "subah subah message 😂", "GM", "rise and shine", "good morning folks",
    "uth gaya main", "neend nahi aayi raat ko", "kal bahut late soye",
]

RANDOM_BANTER = [
    "yaar kya ho raha hai aajkal", "bhai scene kya hai?", "koi hai?",
    "haha", "lol", "hahaha xd", "😂😂", "sahi keh raha hai", "exactly",
    "agree", "haan bhai", "nahi yaar", "kya baat hai", "chal theek hai",
    "okay", "acha", "+1", "done", "haan", "nahi", "dekhte hain",
    "kal bataunga", "pata nahi", "sach mein?", "seriously?", "wow",
    "nice", "bahut accha", "mast", "bilkul", "ekdum sahi", "100%",
    "totally agree", "nope", "maybe", "could be", "thik hai",
    "samajh nahi aya", "phirse bol", "kya?", "bhai sun",
    "kal milte hain", "abhi busy hoon", "bad hai", "acha lag raha hai",
    "👍", "👌", "❤️", "🔥", "😍", "😅", "🤦", "🙏",
]

FOOD_CHAT = [
    "yaar lunch kahan khaya aaj?", "ghar ka khana tha", "order kiya pizza",
    "biryani kha raha hoon 😍", "diet pe hoon bhai 😭", "snacks chahiye",
    "koi accha restaurant suggest karo", "Zomato order karte hain",
    "bahut ghanta hungry hoon", "bhai khana khaya kya?",
    "aaj mood nahi tha cooking ka", "mummy ne banaya ghar pe",
    "lunch date pe?", "office mein khaya canteen se", "thali ka plan?",
]

MOVIE_CHAT = [
    "koi acchi movie dekhi?", "OTT pe kya hai naya?", "Netflix mein accha nahi hai kuch",
    "Prime pe ek movie dekhi bahut acchi thi", "series recommend karo yaar",
    "koi watch list mein hai?", "weekend pe movie plan?", "cinema jane ka mood?",
    "Bollywood meh hua hi kya hai lately", "Hollywood latest kya hai",
    "yaar spoiler mat dena", "review kya hai?", "stars?",
    "RRR watch ki kya?", "Oppenheimer mast thi",
]

WORK_CHAT = [
    "office aaj bore ho gaya", "meeting pe meeting yaar 😭",
    "deadline kal hai, kaam bahut hai", "wfh ya office?", "WFH hai aaj",
    "manager ne phir kaam diya 🙄", "appraisal ke baare mein koi soch raha hai?",
    "increment ka kya hua?", "team outing plan hona chahiye",
    "friday ko jaldi chhutti milegi?", "office politics 😤",
    "naya project assign hua", "client call tha aaj",
    "presentation tha, went okay", "work life balance kahan hai yaar",
]

CRICKET_CHAT = [
    "match dekhoge aaj?", "India ne jeeta!", "Pakistan match",
    "Kohli ne mara 🔥", "cricket ka kya update?", "IPL kab se?",
    "bhai match ka score kya hai?", "arey din baar match replay mat karo",
    "bahut accha khela aaj", "wicket gir gaya", "six!!",
    "Dhoni forever 🏏", "Rohit kaptan best", "Women's cricket bhi dekho",
]

GENERAL_NOISE = [
    "[Image omitted]", "<Media omitted>",
    "Forwarded message", "This message was deleted",
    "Reacted to your message", "left the group",
    "😂😂😂", "xD", "hahaha", "kek",
    "bhai sun sun sun", "yaar yaar yaar",
    "okay okay okay", "chal chal", "haan haan",
    "lol no", "nope nope", "yes yes",
    "acha bhai bas", "theek hai bhai",
]

WEEKEND_CHAT = [
    "weekend pe kya plan?", "ghar pe hoon Saturday", "Sunday ko milte hain?",
    "market jaana hai", "drive pe jaate hain bhai", "ghar pe boring ho raha hoon",
    "party karte hain?", "chill karo sab", "Netflix and chill",
    "bahar niklenge?", "weather accha hai aaj", "sun nikal raha hai",
    "barish aa gayi", "thanda ho gaya mausam",
]

RANDOM_TOPICS = [
    "guys koi share karo acchi song", "koi book suggest karo",
    "podcast accha laga recently", "youtube pe kya dekh rahe ho?",
    "reddit pe interesting thread tha", "twitter/X se hatao karo yaar",
    "Instagram stories dekhte rehte ho?", "reels dekh ke time waste ho gaya",
    "bhai gym gaye?", "exercise kab se chhodna hai bhai 😂",
    "koi gym partner chahiye", "health is wealth", "sleep schedule kharab hai mera",
    "stress bahut zyada hai", "meditation try karo", "yoga anyone?",
    "koi investment tip hai?", "crypto kya hua?", "market down hai",
    "petrol price phir badh gaya", "inflation yaar 😭",
    "koi scholarship mil sakti hai?", "college days yaad aa gaye",
    "yaar placement kab hogi?", "internship ka kya?",
]

REACTION_MESSAGES = ["👍", "❤️", "😂", "🔥", "👌", "✅", "🎉", "😍", "🙌", "+1"]


def weighted_time(start: datetime, end: datetime) -> datetime:
    """Generate a realistic chat timestamp — more frequent in evenings."""
    total_seconds = int((end - start).total_seconds())
    day_offset = random.randint(0, total_seconds // 86400) * 86400
    base = start + timedelta(seconds=day_offset)
    # Weighted hour distribution: peak 7pm-11pm
    hour_weights = [1, 1, 1, 1, 1, 1, 2, 3, 4, 4, 4, 4,
                    5, 5, 5, 4, 4, 4, 6, 8, 9, 9, 8, 4]
    hour = random.choices(range(24), weights=hour_weights)[0]
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    return base.replace(hour=hour, minute=minute, second=second)


def make_filler_message(idx: int, start: datetime, end: datetime) -> dict:
    """Generate a single realistic filler message."""
    ts = weighted_time(start, end)
    sender = random.choice(PARTICIPANTS)
    conversation_id = "general"

    pool = random.choices(
        [MORNING_GREETINGS, RANDOM_BANTER, FOOD_CHAT, MOVIE_CHAT,
         WORK_CHAT, CRICKET_CHAT, GENERAL_NOISE, WEEKEND_CHAT,
         RANDOM_TOPICS, REACTION_MESSAGES],
        weights=[5, 30, 10, 8, 10, 8, 10, 8, 8, 3],
    )[0]

    text = random.choice(pool)

    # Add typos occasionally
    if random.random() < 0.08 and len(text) > 5:
        pos = random.randint(0, len(text) - 1)
        text = text[:pos] + random.choice("qwrtyps") + text[pos:]

    # Occasionally add extra chars
    if random.random() < 0.05:
        text = text + "??"

    # Determine message type
    if text in ("[Image omitted]", "<Media omitted>", "Forwarded message", "This message was deleted"):
        msg_type = "media"
    elif text.startswith("Reacted"):
        msg_type = "reaction"
    elif text == "left the group":
        msg_type = "system"
    else:
        msg_type = "text"

    return {
        "id": f"msg_{idx:06d}",
        "timestamp": ts.isoformat(),
        "sender": sender,
        "text": text,
        "conversation_id": conversation_id,
        "message_type": msg_type,
    }


def make_thread_messages(thread: list[tuple], conv_id: str) -> list[dict]:
    """Convert a thread definition to message dicts (auto-ID'd)."""
    msgs = []
    for i, (ts, sender, text) in enumerate(thread):
        msgs.append({
            "id": f"msg_thread_{conv_id}_{i:03d}",
            "timestamp": ts,
            "sender": sender,
            "text": text,
            "conversation_id": conv_id,
            "message_type": "text",
        })
    return msgs


def main() -> None:
    START = datetime(2026, 3, 1)
    END = datetime(2026, 8, 31, 23, 59, 59)

    messages: list[dict] = []

    # ── Key decision messages ─────────────────────────────────────────────
    messages.extend(KEY_MESSAGES)

    # ── Thread context messages ───────────────────────────────────────────
    messages.extend(make_thread_messages(TRIP_THREAD, "trip_manali"))
    messages.extend(make_thread_messages(RESTAURANT_THREAD, "birthday_restaurant"))
    messages.extend(make_thread_messages(PROJECT_THREAD, "project_techstack"))

    existing_count = len(messages)

    # ── Filler messages ───────────────────────────────────────────────────
    TARGET = 4200
    filler_needed = TARGET - existing_count
    print(f"Thread/key messages: {existing_count}")
    print(f"Generating {filler_needed} filler messages …")

    for i in range(filler_needed):
        msg = make_filler_message(i + 1000, START, END)
        messages.append(msg)

    # ── Sort by timestamp ─────────────────────────────────────────────────
    messages.sort(key=lambda m: m["timestamp"])

    # ── Deduplicate IDs (safety) ──────────────────────────────────────────
    seen_ids: set[str] = set()
    unique: list[dict] = []
    counter = 10000
    for m in messages:
        if m["id"] in seen_ids:
            m = dict(m)
            m["id"] = f"msg_{counter:06d}"
            counter += 1
        seen_ids.add(m["id"])
        unique.append(m)

    messages = unique

    print(f"Total messages: {len(messages)}")

    # ── Validate key message IDs still present ────────────────────────────
    id_set = {m["id"] for m in messages}
    for km in KEY_MESSAGES:
        assert km["id"] in id_set, f"Key message {km['id']} lost!"

    # ── Write output ──────────────────────────────────────────────────────
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(messages, f, ensure_ascii=False, indent=2)

    print(f"Written to {OUT_PATH}")

    # Print key message summary
    print("\nKey decision messages:")
    for km in KEY_MESSAGES:
        print(f"  {km['id']}  [{km['sender']}] {km['text'][:60]}")


if __name__ == "__main__":
    main()
