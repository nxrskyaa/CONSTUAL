// Content for the in-game health zones.
//
// IMPORTANT: `id` is the on-chain `diseaseId` used by completeQuest / claimBadge.
// It must match a disease registered in the ConstualCore contract. The live app
// registers diseases 1-5 (see src/data.ts):
//   1 = Common Cold (Flu Ringan)   2 = Hypertension   3 = Type 2 Diabetes
//   4 = GERD                        5 = Dengue Fever
//
// Zone 1 (Hydration & Dehydration) is mapped to diseaseId 5 (Dengue), where fluid
// management is the central lesson. Zone 2 (Fever & Flu) is mapped to diseaseId 1
// (Common Cold). Change these ids if your contract registers different topics.

export interface Zone {
  id: number; // = diseaseId on-chain
  name: string;
  nameId: string; // Indonesian
  description: string;
  npcName: string;
  npcDialog: string[];
  quiz: { question: string; options: string[]; correct: number }[];
}

export const zones: Zone[] = [
  {
    id: 5,
    name: "Hydration & Dehydration",
    nameId: "Hidrasi & Dehidrasi",
    description:
      "Learn why your body needs water, how to spot early dehydration, and when fluid loss becomes an emergency.",
    npcName: "Nurse Tirta",
    npcDialog: [
      "Hi! I'm Nurse Tirta. Your body is about 60% water — every cell depends on it.",
      "Water helps you concentrate, digest food, control body temperature, and keep your blood flowing.",
      "Early signs of dehydration are easy to miss: thirst, dark yellow urine, dry lips, tiredness, and headache.",
      "On hot days or when you're sick with fever, vomiting, or diarrhea, you lose fluid much faster.",
      "Warning: confusion, fainting, a racing heartbeat, or no urination for many hours are signs of severe dehydration — that needs urgent medical care.",
      "Ready to prove what you've learned? Answer a couple of questions and I'll record your quest on Ritual Testnet.",
    ],
    quiz: [
      {
        question: "Which is an early sign of dehydration?",
        options: [
          "Dark yellow urine and thirst",
          "Clear urine every hour",
          "Feeling cold and shivering",
        ],
        correct: 0,
      },
      {
        question: "Which situation makes you lose fluids faster?",
        options: [
          "Sitting in air conditioning",
          "Fever, vomiting, or diarrhea",
          "Sleeping eight hours",
        ],
        correct: 1,
      },
      {
        question: "Which is a sign of SEVERE dehydration that needs urgent care?",
        options: [
          "Mild thirst after exercise",
          "A little tiredness in the afternoon",
          "Confusion, fainting, or no urination for many hours",
        ],
        correct: 2,
      },
    ],
  },
  {
    id: 1,
    name: "Fever & Flu",
    nameId: "Demam & Flu",
    description:
      "Understand what a fever actually is, why most colds are viral, and the safe, simple ways to recover.",
    npcName: "Dr. Hangat",
    npcDialog: [
      "Hello! I'm Dr. Hangat. A fever is your body raising its temperature to fight infection — it's a defense, not the disease itself.",
      "The common cold and flu are usually caused by viruses, so antibiotics do NOT help them.",
      "Safe supportive care is best: rest, plenty of fluids, and monitoring how you feel.",
      "Cover coughs and sneezes, wash your hands, and stay home when sick so you don't spread it to others.",
      "Warning: trouble breathing, chest pain, a very high fever that won't come down, or symptoms getting worse means it's time to see a health professional.",
      "Take the quick quiz and I'll record your learning quest on-chain!",
    ],
    quiz: [
      {
        question: "Do antibiotics cure a typical viral cold or flu?",
        options: [
          "No — colds and flu are usually viral",
          "Yes — always take antibiotics",
          "Only if you take them with coffee",
        ],
        correct: 0,
      },
      {
        question: "What is the safest first step for a mild fever or cold?",
        options: [
          "Ignore symptoms and exercise hard",
          "Rest, drink fluids, and monitor symptoms",
          "Stop drinking water completely",
        ],
        correct: 1,
      },
      {
        question: "Which symptom means you should seek medical help?",
        options: [
          "A mild runny nose",
          "Sneezing a few times a day",
          "Trouble breathing or chest pain",
        ],
        correct: 2,
      },
    ],
  },
];

export function getZone(id: number): Zone | undefined {
  return zones.find((zone) => zone.id === id);
}

// Convert a quiz result into the 60-100 score the contract expects.
// (completeQuest requires score between 60 and 100.)
export function scoreFromQuiz(correctCount: number, total: number): number {
  if (total <= 0) return 60;
  const ratio = correctCount / total;
  return Math.round(60 + ratio * 40); // 0% -> 60, 100% -> 100
}

// Number of correct answers required to "pass" a zone quiz.
export function passThreshold(total: number): number {
  return Math.ceil(total / 2);
}
