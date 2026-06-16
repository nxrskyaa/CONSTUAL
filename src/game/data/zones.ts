// Quest content for the in-game health zones.
//
// `id` is the on-chain `diseaseId` passed to completeQuest / claimBadge and must
// match a disease registered in ConstualCore (the live contract registers 1-5).
// Topics are assigned per the character roster:
//   1 seesac      -> Common illness: Fever & Flu
//   2 siggy_anime -> Hydration & Dehydration
//   3 rikky       -> Sleep Health
//   4 rizan       -> Stress & Mental Health
//   5 jez         -> Nutrition
// (On-chain disease *names* differ from these game topics; only the id is
// recorded. Adjust ids here if your contract registers different topics.)

export interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
}

export interface Zone {
  id: number; // = diseaseId on-chain
  name: string;
  nameId: string; // Indonesian
  description: string;
  npcKey: string; // which character teaches it
  npcName: string;
  npcDialog: string[];
  quiz: QuizQuestion[];
}

export const zones: Zone[] = [
  {
    id: 1,
    name: "Fever & Flu",
    nameId: "Demam & Flu",
    npcKey: "seesac",
    npcName: "Seesac",
    description: "What a fever really is, why colds are viral, and how to recover safely.",
    npcDialog: [
      "Meow~ I'm Seesac. Let's talk about something everyone gets: fever and the common cold.",
      "A fever is your body raising its temperature to fight infection. It's a defense, not the illness itself.",
      "Colds and flu are caused by viruses, so antibiotics do NOT help them — rest and fluids do.",
      "Cover your coughs, wash your hands, and stay home when you're sick so it doesn't spread.",
      "See a doctor if there's trouble breathing, chest pain, a very high fever, or symptoms getting worse.",
      "Ready to prove it? Pass my quiz and I'll record your quest on Ritual Testnet!",
    ],
    quiz: [
      { question: "Do antibiotics cure a typical viral cold or flu?", options: ["No — colds and flu are usually viral", "Yes, always", "Only with coffee"], correct: 0 },
      { question: "Safest first step for a mild fever or cold?", options: ["Hard exercise", "Rest, fluids, and monitor symptoms", "Stop drinking water"], correct: 1 },
      { question: "Which symptom means you should seek medical help?", options: ["A mild runny nose", "Sneezing a few times", "Trouble breathing or chest pain"], correct: 2 },
    ],
  },
  {
    id: 2,
    name: "Hydration & Dehydration",
    nameId: "Hidrasi & Dehidrasi",
    npcKey: "siggy_anime",
    npcName: "Siggy Anime Girl",
    description: "Why your body needs water, early dehydration signs, and the danger signs.",
    npcDialog: [
      "Hi! I'm Siggy Anime Girl. I'll teach you about hydration and how to keep your body healthy!",
      "Water powers your focus, digestion, temperature control, and keeps your blood flowing.",
      "Early dehydration is sneaky: thirst, dark yellow urine, dry lips, tiredness, and headache.",
      "On hot days, or with fever, vomiting, or diarrhea, you lose fluids much faster.",
      "Danger signs — confusion, fainting, racing heartbeat, no urine for many hours — need urgent care.",
      "Take my quiz and I'll record your hydration quest on-chain!",
    ],
    quiz: [
      { question: "Which is an early sign of dehydration?", options: ["Dark yellow urine and thirst", "Clear urine hourly", "Feeling cold"], correct: 0 },
      { question: "Which makes you lose fluids faster?", options: ["Air conditioning", "Fever, vomiting, or diarrhea", "Sleeping 8 hours"], correct: 1 },
      { question: "A sign of SEVERE dehydration needing urgent care?", options: ["Mild thirst", "A little tiredness", "Confusion or fainting"], correct: 2 },
    ],
  },
  {
    id: 3,
    name: "Sleep Health",
    nameId: "Kesehatan Tidur",
    npcKey: "rikky",
    npcName: "Rikky",
    description: "Why sleep is foundational, and habits for better, deeper rest.",
    npcDialog: [
      "Hey, I'm Rikky. Sleep isn't lazy — it's when your brain and body repair themselves.",
      "Most adults need about 7-9 hours. Chronic short sleep hurts focus, mood, and immunity.",
      "Sleeping only 4-5 hours can drop your thinking to a level like mild intoxication.",
      "Keep a consistent schedule, dim screens before bed, and avoid late caffeine.",
      "If you can't sleep for weeks or you snore and gasp at night, talk to a professional.",
      "Pass my quiz and I'll log your sleep quest on Ritual Testnet!",
    ],
    quiz: [
      { question: "How much sleep do most adults need?", options: ["3-4 hours", "7-9 hours", "12+ hours"], correct: 1 },
      { question: "Which habit helps sleep?", options: ["Late-night caffeine", "Bright screens in bed", "A consistent sleep schedule"], correct: 2 },
      { question: "Chronic lack of sleep can...", options: ["Improve memory", "Harm focus, mood, and immunity", "Have no effect"], correct: 1 },
    ],
  },
  {
    id: 4,
    name: "Stress & Mental Health",
    nameId: "Stres & Kesehatan Mental",
    npcKey: "rizan",
    npcName: "Rizan",
    description: "Understanding stress, its body effects, and calming, healthy coping.",
    npcDialog: [
      "Greetings, traveler. I am Rizan. Let us speak of the mind — stress and mental health.",
      "Stress releases hormones like cortisol and adrenaline. Short bursts are normal; constant stress is not.",
      "It can show up as poor sleep, a racing heart, irritability, or trouble focusing.",
      "Healthy coping: movement, slow breathing, limiting doomscrolling, and real human connection.",
      "Reaching out for help is strength, not weakness. Persistent anxiety or sadness deserves support.",
      "Answer my questions, and your quest shall be sealed on-chain.",
    ],
    quiz: [
      { question: "Which hormone is linked to stress?", options: ["Cortisol", "Chlorophyll", "Calcium"], correct: 0 },
      { question: "A healthy way to cope with stress?", options: ["Endless doomscrolling", "Movement and slow breathing", "Ignoring it forever"], correct: 1 },
      { question: "Asking for help with mental health is...", options: ["A weakness", "Strength and self-care", "Pointless"], correct: 1 },
    ],
  },
  {
    id: 5,
    name: "Nutrition",
    nameId: "Nutrisi",
    npcKey: "jez",
    npcName: "Dr. Jez",
    description: "Building a balanced plate and steady energy without strict rules.",
    npcDialog: [
      "Ribbit! Dr. Jez here, your friendly nutrition scientist. Let's build a healthier plate.",
      "Balance beats strict rules: vegetables, protein, whole-grain carbs, fruit, and water.",
      "Sweet drinks add sugar fast — start there if you want one easy win.",
      "Your brain needs steady fuel; very irregular meals can swing your focus and mood.",
      "No shame-based dieting. Small, consistent changes win over extreme short-term plans.",
      "Pass the quiz and I'll record your nutrition quest on Ritual Testnet!",
    ],
    quiz: [
      { question: "A balanced plate mostly contains...", options: ["Only sugary drinks", "Veggies, protein, whole grains, fruit", "Just one food group"], correct: 1 },
      { question: "One easy win to cut added sugar?", options: ["Reduce sweet drinks", "Skip all meals", "Eat only at night"], correct: 0 },
      { question: "Best approach to eating better?", options: ["Extreme crash diets", "Small consistent changes", "Shame-based dieting"], correct: 1 },
    ],
  },
];

export function getZone(id: number): Zone | undefined {
  return zones.find((z) => z.id === id);
}

// completeQuest requires a score between 60 and 100.
export function scoreFromQuiz(correctCount: number, total: number): number {
  if (total <= 0) return 60;
  return Math.round(60 + (correctCount / total) * 40);
}

export function passThreshold(total: number): number {
  return Math.ceil(total / 2);
}
