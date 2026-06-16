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
}

export const NPCS: NpcDef[] = [
  // --- Quest givers (zones 1-5) --- positions are tiles on the 50x40 map
  { key: "seesac", name: "Seesac", spriteKey: "seesac", area: "forest", tileX: 12, tileY: 10, wander: true, zoneId: 1, accent: 0xff8db0 },
  { key: "siggy_anime", name: "Siggy Anime Girl", spriteKey: "siggy_anime", area: "coast", tileX: 12, tileY: 28, wander: true, zoneId: 2, accent: 0x6ee7ff },
  { key: "rikky", name: "Rikky", spriteKey: "rikky", area: "forest", tileX: 15, tileY: 12, wander: true, zoneId: 3, accent: 0xc8f169 },
  { key: "rizan", name: "Rizan", spriteKey: "rizan", area: "mystic", tileX: 33, tileY: 29, wander: true, zoneId: 4, accent: 0xc792ff },
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
    wander: true,
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
    tileX: 35,
    tileY: 14,
    wander: true,
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
    tileX: 15,
    tileY: 30,
    wander: true,
    zoneId: null,
    accent: 0xb0b8ff,
    dialog: [
      "Nyaa~ I'm Jepanya, EVM++ enjoyer. Coding all night? Your body keeps the score.",
      "Stretch your wrists, blink often, and drink water between commits.",
      "Ship code, but ship a healthy you too. Ganbatte!",
    ],
  },
];

/** Dialog lines for an NPC, pulling from its zone when it's a quest-giver. */
export function npcDialogLines(npc: NpcDef): string[] {
  if (npc.zoneId != null) {
    const zone = getZone(npc.zoneId);
    if (zone) return zone.npcDialog;
  }
  return npc.dialog ?? ["..."];
}
