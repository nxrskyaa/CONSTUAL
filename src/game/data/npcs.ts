// NPC roster for the overworld.
//
// Quest-givers reference a zone (zoneId 1-5) and use that zone's dialog + quiz.
// Dialog-only characters (builder, guides, web3 topics that have no on-chain
// disease) carry their own `dialog` lines and have zoneId = null.
//
// Tile coordinates are on the 40x30 world map (see MainWorldScene). Each NPC is
// placed inside a themed zone area.

import { getZone } from "./zones";

export type WorldArea = "forest" | "coast" | "desert" | "mystic" | "plaza";

// what an NPC does in the world (beyond plain idle/walk)
export type NpcActivity =
  | "wander"
  | "fish"
  | "tend"
  | "meditate"
  | "sit"
  | "train"
  | "dance" // busts moves in place (e.g. Absol by the ritual flag)
  | "gather" // clusters near a spot, chats, then roams and returns
  | "stroll" // chill long-range wander across the whole map
  | "couple"; // pairs up with a partner NPC (faces them + hearts)

export interface NpcDef {
  key: string; // sprite key (also character id)
  name: string;
  spriteKey: string;
  area: WorldArea;
  tileX: number;
  tileY: number;
  wander: boolean;
  zoneId: number | null; // quest topic; null = dialog only
  dialog?: string[]; // used when zoneId is null
  accent: number; // name-tag accent color
  activity?: NpcActivity; // default "wander"
}

export const NPCS: NpcDef[] = [
  // --- Quest givers (zones 1-5) --- positions are tiles on the 50x40 map
  { key: "seesac", name: "Seesac", spriteKey: "seesac", area: "forest", tileX: 12, tileY: 10, wander: true, zoneId: 1, accent: 0xff8db0 },
  { key: "siggy_anime", name: "Siggy Anime Girl", spriteKey: "siggy_anime", area: "coast", tileX: 13, tileY: 27, wander: false, zoneId: 2, accent: 0x6ee7ff, activity: "fish" },
  { key: "rikky", name: "Rikky", spriteKey: "rikky", area: "forest", tileX: 15, tileY: 12, wander: false, zoneId: 3, accent: 0xc8f169, activity: "sit" },
  { key: "rizan", name: "Rizan", spriteKey: "rizan", area: "mystic", tileX: 33, tileY: 28, wander: false, zoneId: 4, accent: 0xc792ff, activity: "meditate" },
  { key: "jez", name: "Dr. Jez", spriteKey: "jez", area: "forest", tileX: 10, tileY: 14, wander: true, zoneId: 5, accent: 0x7ee0a0 },

  // --- Dialog-only characters ---
  {
    key: "decka",
    name: "Decka",
    spriteKey: "decka",
    area: "desert",
    tileX: 33,
    tileY: 9,
    wander: true,
    zoneId: null,
    accent: 0xffb35c,
    dialog: [
      "Yo! I'm Decka, your Web3 health guide. Builders live online — that takes a toll.",
      "Long sessions wreck your eyes, back, and sleep. The 20-20-20 rule helps: every 20 min, look 20 ft away for 20 sec.",
      "Stand up, stretch, and hydrate between blocks. Your body wasn't built to sit for 12 hours.",
      "Health is the ultimate long-term hold. Take care of yourself, anon.",
    ],
  },
  {
    key: "stefan",
    name: "Stefan",
    spriteKey: "stefan",
    area: "desert",
    tileX: 37,
    tileY: 12,
    wander: true,
    zoneId: null,
    accent: 0x9aa6ff,
    dialog: [
      "Hey, Stefan here — always on my phone, so let's talk screen time and digital health.",
      "Endless scrolling overloads your brain and disrupts sleep. Not every notification deserves a response.",
      "Try screen-free time, grayscale mode, and putting the phone away an hour before bed.",
      "Your attention is valuable. Spend it on purpose.",
    ],
  },
  {
    key: "nxr",
    name: "NXR",
    spriteKey: "nxr",
    area: "plaza",
    tileX: 28,
    tileY: 18,
    wander: false,
    activity: "train",
    zoneId: null,
    accent: 0xc8f169,
    dialog: [
      "Hi, I'm NXR, the builder of Constual!",
      "Constual turns health education into a quest: learn a topic, pass a quiz, and earn proof on Ritual Network.",
      "Talk to every character around the world — each teaches a different health topic.",
      "Connect your wallet, create your Passport, and let's learn and earn together!",
    ],
  },
  {
    key: "josh",
    name: "Josh",
    spriteKey: "josh",
    area: "plaza",
    tileX: 22,
    tileY: 18,
    wander: false,
    activity: "sit",
    zoneId: null,
    accent: 0x9be15d,
    dialog: [
      "Mrrow. I'm Josh, the guide cat of this world. Let me share some tips.",
      "Move with WASD or the arrow keys. On a phone, use the joystick in the corner.",
      "Walk up to anyone with a '!' and press E (or the Talk button) to chat.",
      "Five characters give quests you can complete on-chain. Find them all across the four zones!",
    ],
  },
  {
    key: "evo",
    name: "Evo",
    spriteKey: "evo",
    area: "plaza",
    tileX: 24,
    tileY: 17,
    wander: true,
    zoneId: null,
    accent: 0xc8f169,
    dialog: [
      "Sup, I'm Evo. Health is a long game — small upgrades every day compound, just like good habits.",
      "Sleep, water, movement, food. Stack the basics and you level up for real.",
      "Don't chase hacks. Consistency beats intensity. Let's evolve together!",
    ],
  },
  {
    key: "asceno",
    name: "Asceno",
    spriteKey: "asceno",
    area: "desert",
    tileX: 37,
    tileY: 18,
    wander: false,
    activity: "tend",
    zoneId: null,
    accent: 0xe0b878,
    dialog: [
      "Greetings. I am Asceno, keeper of calm. Even online, the mind needs stillness.",
      "Try a slow breath: in for four, hold four, out for four. Do it three times.",
      "A quiet mind makes better decisions — in life, and on-chain.",
    ],
  },
  {
    key: "jepanya",
    name: "Jepanya",
    spriteKey: "jepanya",
    area: "coast",
    tileX: 20,
    tileY: 31,
    wander: true,
    zoneId: null,
    accent: 0xb0b8ff,
    dialog: [
      "Nyaa~ I'm Jepanya, EVM++ enjoyer. Coding all night? Your body keeps the score.",
      "Stretch your wrists, blink often, and drink water between commits.",
      "Ship code, but ship a healthy you too. Ganbatte!",
    ],
  },
  {
    key: "tutubear",
    name: "Tutubear",
    spriteKey: "tutubear",
    area: "mystic",
    tileX: 35,
    tileY: 29,
    wander: true,
    zoneId: null,
    accent: 0xc89b6a,
    dialog: [
      "Rawr~ I'm Tutubear. Rest is not lazy — bears know hibernation is power.",
      "When you're overwhelmed, slow down. A short nap or a walk resets the mind.",
      "Be kind to yourself. Recovery is part of the grind too.",
    ],
  },
  {
    key: "john",
    name: "John",
    spriteKey: "john",
    area: "mystic",
    tileX: 31,
    tileY: 30,
    wander: true,
    zoneId: null,
    accent: 0x9fd0ff,
    dialog: [
      "Hey, I'm John. Mental health check: how are you, really?",
      "It's okay to log off. Touch grass, call a friend, breathe.",
      "You're not your portfolio. Take care of the human first.",
    ],
  },
  {
    key: "yourinuu",
    name: "Yourinuu",
    spriteKey: "yourinuu",
    area: "forest",
    tileX: 13,
    tileY: 12,
    wander: true,
    zoneId: null,
    accent: 0xffd27a,
    dialog: [
      "Woof! I'm Yourinuu, your loyal companion. A good walk fixes a lot of things.",
      "Fresh air, sunlight, and movement — simple, but they work wonders.",
      "Stay loyal to your health, and it stays loyal to you!",
    ],
  },
  {
    key: "mexxy",
    name: "Mexxy",
    spriteKey: "mexxy",
    area: "plaza",
    tileX: 27,
    tileY: 16,
    wander: true,
    zoneId: null,
    accent: 0xff9bd2,
    dialog: [
      "Hi hi! I'm Mexxy. Energy comes from good food, water, and real sleep.",
      "Skip the third energy drink — your heart will thank you.",
      "Fuel up right and you'll out-last everyone in the bull run!",
    ],
  },
  {
    key: "linhlambo",
    name: "Linhlambo",
    spriteKey: "linhlambo",
    area: "mystic",
    tileX: 38,
    tileY: 33,
    wander: true,
    zoneId: null,
    accent: 0xc792ff,
    dialog: [
      "Yo, Linhlambo here. Posture check — sit up, shoulders back, screen at eye level.",
      "Back pain is the silent killer of long sessions. Move every 30 minutes.",
      "Treat your spine like blue-chip: hold it for the long term.",
    ],
  },
  {
    key: "agata",
    name: "Agata",
    spriteKey: "agata",
    area: "mystic",
    tileX: 42,
    tileY: 30,
    wander: false,
    activity: "meditate",
    zoneId: null,
    accent: 0xff9bd2,
    dialog: [
      "Hello, I'm Agata. Breathing exercises calm the nervous system fast.",
      "Box breathing: in 4, hold 4, out 4, hold 4. Repeat until steady.",
      "Calm mind, clear charts. Take a breath before you ape in.",
    ],
  },
  {
    key: "hytamm",
    name: "Hytamm",
    spriteKey: "hytamm",
    area: "mystic",
    tileX: 36,
    tileY: 34,
    wander: false,
    activity: "meditate",
    zoneId: null,
    accent: 0x8a6cff,
    dialog: [
      "I'm Hytamm. The mystic grove teaches patience — and so does health.",
      "Hydrate, stretch, and rest. The body rewards consistency, not hype.",
      "Stillness is a skill. Practice it daily.",
    ],
  },
  {
    key: "whuan",
    name: "Whuan",
    spriteKey: "whuan",
    area: "coast",
    tileX: 8,
    tileY: 23,
    wander: false,
    activity: "fish", // fishing from the north bank of the pond
    zoneId: null,
    accent: 0x6ee7ff,
    dialog: [
      "Ahoy, I'm Whuan. The coast reminds me: hydration is everything.",
      "Carry a water bottle. Sip through the day, not just when thirsty.",
      "Stay fluid, stay sharp!",
    ],
  },
  {
    key: "kippo",
    name: "Kippo.G",
    spriteKey: "kippo",
    area: "forest",
    tileX: 8,
    tileY: 17,
    wander: true,
    zoneId: null,
    accent: 0xc8f169,
    dialog: [
      "Hey! Kippo.G here. Nature walks are underrated for mental health.",
      "Ten minutes among the trees lowers stress more than ten minutes scrolling.",
      "Go touch some grass — literally. It helps!",
    ],
  },
  {
    key: "shin",
    name: "Shin",
    spriteKey: "shin",
    area: "desert",
    tileX: 46,
    tileY: 16,
    wander: true,
    activity: "stroll", // roams widely so he isn't just standing around
    zoneId: null,
    accent: 0xffb35c,
    dialog: [
      "I'm Shin. Discipline beats motivation — small daily reps win.",
      "Sleep schedule, water, sunlight, movement. Lock the basics.",
      "Build your health like you build on-chain: one solid block at a time.",
    ],
  },

  // ---------------------------------------------------------------------------
  // New roster (D:/characters/newcharac) — placed in lively groups across the
  // world with their own activities so the map feels alive, not generic.
  // ---------------------------------------------------------------------------

  // -- Plaza, around the Ritual flag (a little crowd + Absol dancing) --
  {
    key: "absol", name: "Absol", spriteKey: "absol", area: "plaza",
    tileX: 27, tileY: 22, wander: false, activity: "dance", zoneId: null, accent: 0x6ee7ff,
    dialog: [
      "I'm Absol — dancing keeps the body and the mood alive!",
      "Move a little every hour: shake it out, stretch, vibe.",
      "Health is a celebration, not a chore. Dance with me by the flag!",
    ],
  },
  {
    key: "travis", name: "Travis", spriteKey: "travis", area: "plaza",
    tileX: 23, tileY: 22, wander: false, activity: "gather", zoneId: null, accent: 0xff9bd2,
    dialog: [
      "Yo, Travis here. Good friends are good medicine.",
      "Talk it out — connection lowers stress more than any supplement.",
      "Stay social, stay healthy.",
    ],
  },
  {
    key: "online", name: "Online", spriteKey: "online", area: "plaza",
    tileX: 27, tileY: 18, wander: false, activity: "gather", zoneId: null, accent: 0x9fe7ff,
    dialog: [
      "I'm Online — always connected, but balance is key.",
      "Take real breaks from the screen, anon.",
      "Log off sometimes; the timeline can wait.",
    ],
  },
  {
    key: "ng", name: "NG", spriteKey: "ng", area: "plaza",
    tileX: 22, tileY: 21, wander: true, zoneId: null, accent: 0xc8f169,
    dialog: [
      "NG here. Small habits compound into big health.",
      "Water, walk, sleep — repeat daily.",
      "Keep stacking the basics.",
    ],
  },

  // -- Forest clearing crew --
  {
    key: "habex", name: "Habex", spriteKey: "habex", area: "forest",
    tileX: 6, tileY: 7, wander: false, activity: "gather", zoneId: null, accent: 0x7ee0a0,
    dialog: [
      "Hey, I'm Habex. Stretch those shoulders after long sessions.",
      "Mobility today saves pain tomorrow.",
      "Loosen up, builder.",
    ],
  },
  {
    key: "chala", name: "Chala", spriteKey: "chala", area: "forest",
    tileX: 8, tileY: 6, wander: false, activity: "gather", zoneId: null, accent: 0xffd27a,
    dialog: [
      "Chala! Sunshine and fresh air reset the mind.",
      "Ten minutes outside beats ten more scrolling.",
      "Go catch some light.",
    ],
  },
  {
    key: "bien", name: "Bien", spriteKey: "bien", area: "forest",
    tileX: 18, tileY: 14, wander: true, zoneId: null, accent: 0x9be15d,
    dialog: [
      "Bien here. Posture check — sit tall, screen at eye level.",
      "Your spine is a long-term hold.",
      "Move every half hour.",
    ],
  },
  {
    key: "moctx", name: "Moctx", spriteKey: "moctx", area: "forest",
    tileX: 20, tileY: 8, wander: true, zoneId: null, accent: 0xb0b8ff,
    dialog: [
      "Moctx here. Walk and think — movement boosts ideas.",
      "Pacing beats sitting when you're stuck.",
      "Keep moving, keep building.",
    ],
  },

  // -- Coast / springs --
  {
    key: "skyzee", name: "Skyzee", spriteKey: "skyzee", area: "coast",
    tileX: 15, tileY: 30, wander: false, activity: "gather", zoneId: null, accent: 0x6ee7ff,
    dialog: [
      "I'm Skyzee. Deep breaths clear the head fast.",
      "In for four, out for four. Try it.",
      "Calm mind, steady hands.",
    ],
  },
  {
    key: "kamalz", name: "Kamalz", spriteKey: "kamalz", area: "coast",
    tileX: 19, tileY: 31, wander: false, activity: "sit", zoneId: null, accent: 0xffb35c,
    dialog: [
      "Kamalz, resting on the bench. Rest is productive.",
      "Naps and breaks recharge focus.",
      "Don't grind on empty.",
    ],
  },
  {
    key: "babass", name: "Babass", spriteKey: "babass", area: "coast",
    tileX: 4, tileY: 27, wander: false, activity: "fish", zoneId: null, accent: 0x73b4ec,
    dialog: [
      "Babass here. Hydrate — your brain is mostly water.",
      "Sip through the day, not all at once.",
      "Stay fluid.",
    ],
  },

  // -- Desert bazaar --
  {
    key: "omartuta", name: "Omartuta", spriteKey: "omartuta", area: "desert",
    tileX: 42, tileY: 13, wander: false, activity: "gather", zoneId: null, accent: 0xffb35c,
    dialog: [
      "Omartuta! The bazaar's busy — eat real food, not just snacks.",
      "Whole foods give steady energy; sugar spikes crash you.",
      "Good fuel, good gains.",
    ],
  },
  {
    key: "subur", name: "Subur", spriteKey: "subur", area: "desert",
    tileX: 44, tileY: 15, wander: false, activity: "gather", zoneId: null, accent: 0xe0b878,
    dialog: [
      "I'm Subur. Grow your health like a garden — daily care.",
      "Patience and consistency win.",
      "Tend to yourself well.",
    ],
  },
  {
    key: "starknight", name: "Starknight", spriteKey: "starknight", area: "desert",
    tileX: 30, tileY: 12, wander: false, activity: "train", zoneId: null, accent: 0xc8f169,
    dialog: [
      "Starknight, training hard! Strength is built rep by rep.",
      "Even bodyweight squats count between blocks.",
      "Move that body, anon.",
    ],
  },

  // -- Mystic grove gathering --
  {
    key: "kaidanzer", name: "Kai Danzer", spriteKey: "kaidanzer", area: "mystic",
    tileX: 38, tileY: 24, wander: false, activity: "gather", zoneId: null, accent: 0xc792ff,
    dialog: [
      "Kai Danzer here. Community keeps us going.",
      "Share the load — no one builds alone.",
      "Gather, talk, recharge.",
    ],
  },
  {
    key: "stanelope", name: "Stanelope", spriteKey: "stanelope", area: "mystic",
    tileX: 40, tileY: 27, wander: false, activity: "gather", zoneId: null, accent: 0xff9bd2,
    dialog: [
      "Stanelope! Laughter is underrated medicine.",
      "Hang with friends, share a laugh, feel lighter.",
      "Joy is good for the heart.",
    ],
  },
  {
    key: "flylucifer", name: "Fly Lucifer", spriteKey: "flylucifer", area: "mystic",
    tileX: 35, tileY: 27, wander: false, activity: "meditate", zoneId: null, accent: 0x8a6cff,
    dialog: [
      "Fly Lucifer, meditating. Stillness sharpens the mind.",
      "Close your eyes, breathe, let thoughts pass.",
      "Find your calm.",
    ],
  },
  {
    key: "rz", name: "RZ", spriteKey: "rz", area: "mystic",
    tileX: 30, tileY: 26, wander: true, zoneId: null, accent: 0x9fd0ff,
    dialog: [
      "RZ. Eyes tired? 20-20-20: every 20 min, look 20 ft away for 20 s.",
      "Blink often — screens steal your tears.",
      "Protect your vision.",
    ],
  },

  // ---------------------------------------------------------------------------
  // Newest roster + special interactions
  // ---------------------------------------------------------------------------

  // Hazelnty stands with Fly Lucifer as a couple (faces him + hearts).
  {
    key: "hazelnty", name: "Hazelnty", spriteKey: "hazelnty", area: "mystic",
    tileX: 36, tileY: 27, wander: false, activity: "couple", zoneId: null, accent: 0xff9bd2,
    dialog: [
      "Hi, I'm Hazelnty! Love and rest heal more than people admit.",
      "Spend time with someone who makes you calm.",
      "A warm heart is good for the soul — and the blood pressure!",
    ],
  },
  // Baster keeps Rizan company in the grove.
  {
    key: "baster", name: "Baster", spriteKey: "baster", area: "mystic",
    tileX: 32, tileY: 28, wander: false, activity: "sit", zoneId: null, accent: 0xc8f169,
    dialog: [
      "Yo, Baster here, just chilling with Rizan.",
      "Good company makes hard days lighter.",
      "Sit, breathe, vibe. No rush.",
    ],
  },
  // Tutufly flutters around the fish pond.
  {
    key: "tutufly", name: "Tutufly", spriteKey: "tutufly", area: "coast",
    tileX: 8, tileY: 22, wander: true, zoneId: null, accent: 0x6ee7ff,
    dialog: [
      "Tutufly~ I love the pond. Fresh air clears the mind.",
      "Take a slow walk by the water when you're stressed.",
      "Nature is the best reset button.",
    ],
  },
  // SayangXBT strolls the whole map, top to bottom.
  {
    key: "sayangxbt", name: "SayangXBT", spriteKey: "sayangxbt", area: "plaza",
    tileX: 25, tileY: 4, wander: true, activity: "stroll", zoneId: null, accent: 0xffd27a,
    dialog: [
      "SayangXBT, just strolling and touching grass.",
      "A daily walk lowers stress and lifts your mood.",
      "Keep it chill, keep moving.",
    ],
  },
  // Shen, Strobely, Deell — friendly plaza folks who greet with "Gritual!".
  {
    key: "shen", name: "Shen", spriteKey: "shen", area: "plaza",
    tileX: 21, tileY: 16, wander: true, zoneId: null, accent: 0x9fe7ff,
    dialog: [
      "Shen here. Gritual, anon!",
      "A good morning routine sets the whole day right.",
      "Hydrate, stretch, and say gm to a friend.",
    ],
  },
  {
    key: "strobely", name: "Strobely", spriteKey: "strobely", area: "plaza",
    tileX: 29, tileY: 17, wander: true, zoneId: null, accent: 0xff9bd2,
    dialog: [
      "Strobely! Gritual to you!",
      "Smile more — it's a tiny workout for your mood.",
      "Community keeps us healthy and happy.",
    ],
  },
  {
    key: "deell", name: "Deell", spriteKey: "deell", area: "plaza",
    tileX: 24, tileY: 23, wander: true, zoneId: null, accent: 0xc792ff,
    dialog: [
      "Deell here. Gritual, fren!",
      "Small daily wins add up to big health.",
      "Be kind to your future self.",
    ],
  },

  // ---------------------------------------------------------------------------
  // Requested roster from D:/characters/newcharac
  // ---------------------------------------------------------------------------
  {
    key: "baemax", name: "Baemax", spriteKey: "baemax", area: "forest",
    tileX: 6, tileY: 12, wander: true, zoneId: null, accent: 0xc8f169,
    dialog: [
      "Baemax online. Tiny repairs count: stretch, hydrate, breathe.",
      "If your shoulders feel loaded, pause for one minute and reset.",
      "Health maintenance is not dramatic. It is consistent.",
    ],
  },
  {
    key: "billiebed", name: "Billiebed", spriteKey: "billiebed", area: "coast",
    tileX: 5, tileY: 30, wander: false, activity: "sit", zoneId: null, accent: 0x9fd0ff,
    dialog: [
      "Billiebed here. Rest is part of the build cycle.",
      "A real break works better than pretending to rest while scrolling.",
      "Sleep well, then come back sharper.",
    ],
  },
  {
    key: "batagor", name: "Batagor", spriteKey: "batagor", area: "desert",
    tileX: 43, tileY: 10, wander: false, activity: "gather", zoneId: null, accent: 0xffb35c,
    dialog: [
      "Batagor checking in from the bazaar. Snack smart, not random.",
      "Protein, fiber, and water help your energy last longer than sugar spikes.",
      "Good food makes better focus.",
    ],
  },
  {
    key: "icebear", name: "Icebear", spriteKey: "icebear", area: "coast",
    tileX: 6, tileY: 24, wander: false, activity: "fish", zoneId: null, accent: 0x6ee7ff,
    dialog: [
      "Icebear waits by the pond. Patience is a health skill too.",
      "Slow breathing can bring the body out of fight-or-flight mode.",
      "Stay calm, cast clean, hydrate often.",
    ],
  },
  {
    key: "dikzzy", name: "Dikzzy", spriteKey: "dikzzy", area: "forest",
    tileX: 19, tileY: 11, wander: true, zoneId: null, accent: 0x7ee0a0,
    dialog: [
      "Dikzzy here. Feeling dizzy after long sessions? Check basics first.",
      "Water, meals, sleep, and screen breaks matter more than another refresh.",
      "If symptoms are severe or keep returning, ask a professional.",
    ],
  },
  {
    key: "nadsar", name: "Nadsar", spriteKey: "nadsar", area: "mystic",
    tileX: 41, tileY: 26, wander: false, activity: "meditate", zoneId: null, accent: 0xc792ff,
    dialog: [
      "Nadsar speaks softly. Your nervous system likes rhythm.",
      "Try steady sleep, steady meals, and steady movement.",
      "Calm is built by repetition.",
    ],
  },
  {
    key: "skylaaark", name: "Skylaaark", spriteKey: "skylaaark", area: "coast",
    tileX: 18, tileY: 27, wander: true, zoneId: null, accent: 0x73b4ec,
    dialog: [
      "Skylaaark here. Look up from the screen once in a while.",
      "Distance vision, sunlight, and a short walk help your eyes and mood.",
      "The sky is free alpha.",
    ],
  },
  {
    key: "oyeng", name: "Oyeng", spriteKey: "oyeng", area: "plaza",
    tileX: 24, tileY: 21, wander: true, zoneId: null, accent: 0xffd27a,
    dialog: [
      "Oyeng says: do not skip water just because you are busy.",
      "Your brain notices dehydration before your timeline does.",
      "Sip, move, repeat.",
    ],
  },
  {
    key: "juggernaut", name: "Juggernaut", spriteKey: "juggernaut", area: "desert",
    tileX: 45, tileY: 8, wander: false, activity: "train", zoneId: null, accent: 0xff8f5c,
    dialog: [
      "Juggernaut trains slow and steady.",
      "Strength does not need ego: bodyweight reps, walking, and consistency count.",
      "Build the body like infrastructure.",
    ],
  },
  {
    key: "keybi", name: "Keybi", spriteKey: "keybi", area: "mystic",
    tileX: 37, tileY: 31, wander: false, activity: "gather", zoneId: null, accent: 0x9aa6ff,
    dialog: [
      "Keybi keeps the keys to better habits.",
      "Lock in one routine: sleep time, walk time, or screen break time.",
      "One reliable habit can unlock the next.",
    ],
  },
  {
    key: "callmehann", name: "Callmehann", spriteKey: "callmehann", area: "plaza",
    tileX: 20, tileY: 19, wander: true, zoneId: null, accent: 0xff9bd2,
    dialog: [
      "Callmehann here. Check on your friends, not only the charts.",
      "Real connection can lower stress and make hard weeks easier.",
      "Call someone after this quest.",
    ],
  },
];

export const QUEST_TEACHER_NAMES = NPCS.filter((npc) => npc.zoneId != null).map((npc) => npc.name);

/** Dialog lines for an NPC, pulling from its zone when it's a quest-giver. */
export function npcDialogLines(npc: NpcDef): string[] {
  if (npc.zoneId != null) {
    const zone = getZone(npc.zoneId);
    if (zone) return zone.npcDialog;
  }
  return npc.dialog ?? ["..."];
}
