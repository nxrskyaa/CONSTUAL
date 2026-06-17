import { motion } from "framer-motion";
import {
  Activity,
  BadgeCheck,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Droplets,
  ExternalLink,
  Gamepad2,
  Heart,
  Home,
  Languages,
  Leaf,
  Loader2,
  Menu,
  Moon,
  Network,
  Sun,
  ShieldCheck,
  Trophy,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getAddress, type Address } from "viem";
import { useAccount, useChainId, useConfig, useConnect, useDisconnect, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { agentScenarios, diseases, languageLabels, type AgentScenario, type Disease } from "./data";
import GameCanvas from "./game/GameCanvas";
import {
  CONSTUAL_CORE_ADDRESS,
  constualAbi,
  guideProofHash,
  publicClient,
  RITUAL_CHAIN_ID,
  sendConstualTransaction,
  switchToRitualTestnet,
} from "./web3";

type Profile = {
  displayName: string;
  constualUsername: string;
  xUsername: string;
  preferredLanguage: number;
  xp: bigint;
  completedCount: bigint;
  badgeCount: bigint;
  streak: bigint;
  lastActiveDay: bigint;
  totalScore: bigint;
  quizCount: bigint;
  classifierUseCount: bigint;
  agentGuideCount: bigint;
  createdAt: bigint;
  updatedAt: bigint;
  exists: boolean;
};

type ProfileForm = {
  displayName: string;
  constualUsername: string;
  xUsername: string;
  preferredLanguage: number;
};

type LeaderboardRow = Profile & {
  address: Address;
  accuracy: bigint;
};

type Toast = { kind: "success" | "error" | "info"; message: string } | null;
type ClassifierKind = "bp" | "sugar" | "bmi";
type RouteInfo =
  | { name: "landing" }
  | { name: "app" }
  | { name: "play" }
  | { name: "library" }
  | { name: "disease"; slug: string }
  | { name: "quiz"; slug: string }
  | { name: "web3Health"; slug: string }
  | { name: "classifier" }
  | { name: "agent" }
  | { name: "passport" }
  | { name: "leaderboard" }
  | { name: "about" };

const emptyProfile: Profile = {
  displayName: "",
  constualUsername: "",
  xUsername: "",
  preferredLanguage: 0,
  xp: 0n,
  completedCount: 0n,
  badgeCount: 0n,
  streak: 0n,
  lastActiveDay: 0n,
  totalScore: 0n,
  quizCount: 0n,
  classifierUseCount: 0n,
  agentGuideCount: 0n,
  createdAt: 0n,
  updatedAt: 0n,
  exists: false,
};

const emptyForm: ProfileForm = {
  displayName: "",
  constualUsername: "",
  xUsername: "",
  preferredLanguage: 0,
};

const safetyCopy =
  "Constual is for education only. It does not provide diagnosis, treatment decisions, personal diet plans, or emergency medical advice.";
const privacyCopy = "Constual Passport stores learning progress only, not medical records.";

const appLinks = [
  { label: "App", path: "/app", icon: Home },
  { label: "Play", path: "/play", icon: Gamepad2 },
  { label: "Library", path: "/library", icon: BookOpen },
  { label: "Classifier", path: "/classifier", icon: Activity },
  { label: "Agent", path: "/agent", icon: Bot },
  { label: "Passport", path: "/passport", icon: UserRound },
  { label: "Leaderboard", path: "/leaderboard", icon: Trophy },
  { label: "About", path: "/about", icon: ShieldCheck },
] as const;

const featureCards = [
  { title: "Constual World", copy: "Walk a pixel-art map, talk to health NPCs, take quizzes, and record quests on-chain.", path: "/play", icon: Gamepad2, buddy: "blue" },
  { title: "Constual Passport", copy: "A privacy-safe learning identity for modules, badges, and proof activity.", path: "/passport", icon: UserRound, buddy: "lime" },
  { title: "Disease Library", copy: "Short bilingual modules for common health topics without long walls of text.", path: "/library", icon: BookOpen, buddy: "blue" },
  { title: "Constual Classifier", copy: "Education-focused checks for blood pressure, blood sugar, and BMI categories.", path: "/classifier", icon: Activity, buddy: "orange" },
  { title: "Constual Agent", copy: "A simulated bilingual guide with preset wellness scenarios. No API, no backend.", path: "/agent", icon: Bot, buddy: "purple" },
  { title: "Learning Badge", copy: "Complete quiz flows, then claim badges from ConstualCore on Ritual Testnet.", path: "/library", icon: BadgeCheck, buddy: "pink" },
  { title: "Leaderboard", copy: "Read Ritual Testnet progress and sort XP client-side.", path: "/leaderboard", icon: Trophy, buddy: "lime" },
] as const;

type LocalizedText = { id: string; en: string };
type LearningSection = {
  label: LocalizedText;
  title: LocalizedText;
  copy: LocalizedText;
};

type Web3Issue = {
  slug: string;
  title: LocalizedText;
  intro: LocalizedText;
  readTime: string;
  tone: CharacterTone;
  sections: LearningSection[];
};

const commonColdSections: LearningSection[] = [
  {
    label: { id: "Pengertian", en: "Definition" },
    title: { id: "Apa itu common cold?", en: "What is the common cold?" },
    copy: {
      id: "Common cold adalah infeksi saluran napas atas yang paling sering disebabkan virus. Gejalanya biasanya ringan sampai sedang, seperti pilek, bersin, hidung tersumbat, sakit tenggorokan, batuk ringan, dan rasa tidak enak badan. Kondisi ini berbeda dari flu influenza yang umumnya dapat terasa lebih berat.",
      en: "The common cold is an upper respiratory tract infection most often caused by viruses. Symptoms are usually mild to moderate, such as runny nose, sneezing, nasal congestion, sore throat, mild cough, and feeling unwell. It is different from influenza, which can feel more severe.",
    },
  },
  {
    label: { id: "Etiologi", en: "Causes" },
    title: { id: "Penyebab utamanya virus", en: "Viruses are the main cause" },
    copy: {
      id: "Rhinovirus adalah penyebab yang sering, tetapi coronavirus musiman, adenovirus, parainfluenza, dan RSV juga dapat menyebabkan gejala mirip pilek. Karena penyebabnya paling sering virus, antibiotik tidak bermanfaat untuk common cold biasa.",
      en: "Rhinoviruses are a common cause, but seasonal coronaviruses, adenoviruses, parainfluenza viruses, and RSV can also cause cold-like symptoms. Because the cause is usually viral, antibiotics do not help typical common colds.",
    },
  },
  {
    label: { id: "Cara Penularan", en: "Transmission" },
    title: { id: "Menular lewat droplet, tangan, dan permukaan", en: "Spread through droplets, hands, and surfaces" },
    copy: {
      id: "Virus dapat menyebar saat orang sakit batuk, bersin, berbicara dekat, atau menyentuh benda setelah menyentuh hidung dan mulut. Tangan yang terkontaminasi lalu menyentuh mata, hidung, atau mulut dapat memindahkan virus ke tubuh.",
      en: "Viruses can spread when a sick person coughs, sneezes, talks closely, or touches objects after touching the nose or mouth. Contaminated hands that touch the eyes, nose, or mouth can transfer the virus into the body.",
    },
  },
  {
    label: { id: "Faktor Risiko", en: "Risk Factors" },
    title: { id: "Siapa yang lebih mudah terkena?", en: "Who is more likely to catch it?" },
    copy: {
      id: "Risiko meningkat pada anak-anak, orang yang sering berada di tempat ramai, kurang tidur, stres, perokok, dan orang dengan daya tahan tubuh rendah. Musim hujan atau cuaca dingin dapat membuat orang lebih sering berada di ruangan tertutup sehingga penularan lebih mudah terjadi.",
      en: "Risk is higher in children, people in crowded places, people with poor sleep, stress, smoking exposure, or lower immune defenses. Rainy or cold seasons can keep people indoors, making transmission easier.",
    },
  },
  {
    label: { id: "Faktor Pencetus", en: "Triggers" },
    title: { id: "Pemicu yang memperburuk gejala", en: "Triggers that can worsen symptoms" },
    copy: {
      id: "Udara kering, asap rokok, polusi, kurang minum, kurang istirahat, dan alergi hidung dapat membuat hidung dan tenggorokan terasa lebih tidak nyaman. Pemicu ini tidak selalu menjadi penyebab infeksi, tetapi bisa memperberat keluhan.",
      en: "Dry air, cigarette smoke, pollution, dehydration, lack of rest, and nasal allergies can make the nose and throat feel more uncomfortable. These triggers may not cause the infection, but they can worsen symptoms.",
    },
  },
  {
    label: { id: "Patofisiologi", en: "Pathophysiology" },
    title: { id: "Mengapa hidung meler dan tersumbat?", en: "Why does the nose run and feel blocked?" },
    copy: {
      id: "Saat virus masuk ke mukosa hidung, tubuh merespons dengan peradangan. Pembuluh darah melebar, produksi lendir meningkat, dan jaringan hidung membengkak. Inilah yang menyebabkan pilek, hidung tersumbat, bersin, dan tenggorokan terasa gatal.",
      en: "When a virus reaches the nasal lining, the body responds with inflammation. Blood vessels widen, mucus production increases, and nasal tissue swells. This leads to runny nose, congestion, sneezing, and an itchy throat.",
    },
  },
  {
    label: { id: "Gejala Klinis", en: "Symptoms" },
    title: { id: "Gejala yang sering muncul", en: "Common symptoms" },
    copy: {
      id: "Gejala umum meliputi bersin, pilek, hidung tersumbat, sakit tenggorokan, batuk ringan, suara serak, sakit kepala ringan, dan lemas. Demam tinggi, sesak napas, nyeri dada, atau kondisi yang memburuk perlu diperhatikan sebagai tanda untuk mencari bantuan medis.",
      en: "Common symptoms include sneezing, runny nose, congestion, sore throat, mild cough, hoarse voice, mild headache, and fatigue. High fever, shortness of breath, chest pain, or worsening condition should be treated as reasons to seek medical help.",
    },
  },
  {
    label: { id: "Diagnosis", en: "Diagnosis" },
    title: { id: "Biasanya berdasarkan gejala", en: "Usually based on symptoms" },
    copy: {
      id: "Common cold biasanya dikenali dari pola gejala dan pemeriksaan sederhana. Tes laboratorium tidak selalu diperlukan. Namun, tenaga kesehatan dapat mempertimbangkan pemeriksaan tambahan bila gejala berat, berlangsung lama, atau ada risiko penyakit lain.",
      en: "The common cold is usually recognized from symptom patterns and a simple assessment. Laboratory tests are not always needed. A health professional may consider more checks when symptoms are severe, prolonged, or another condition is possible.",
    },
  },
  {
    label: { id: "Tata Laksana", en: "Management" },
    title: { id: "Perawatan suportif dan aman", en: "Supportive and safe care" },
    copy: {
      id: "Perawatan umum meliputi istirahat, cukup cairan, makan bergizi, menjaga kelembapan udara, dan menggunakan obat bebas sesuai aturan bila diperlukan untuk keluhan seperti demam atau hidung tersumbat. Antibiotik tidak digunakan untuk common cold biasa kecuali ada indikasi infeksi bakteri dari tenaga kesehatan.",
      en: "General care includes rest, fluids, nutritious meals, humidified air, and over-the-counter medicines as directed when needed for symptoms such as fever or congestion. Antibiotics are not used for typical common colds unless a clinician identifies a bacterial indication.",
    },
  },
  {
    label: { id: "Komplikasi", en: "Complications" },
    title: { id: "Kapan perlu lebih waspada?", en: "When to be more cautious" },
    copy: {
      id: "Sebagian besar membaik sendiri, tetapi beberapa orang dapat mengalami sinusitis, infeksi telinga, kambuhnya asma, atau infeksi saluran napas bawah. Waspadai gejala yang makin berat, demam tinggi menetap, nyeri telinga berat, sesak, atau batuk yang lama memburuk.",
      en: "Most cases improve on their own, but some people may develop sinusitis, ear infection, asthma flare, or lower respiratory infection. Watch for worsening symptoms, persistent high fever, severe ear pain, breathlessness, or a cough that keeps getting worse.",
    },
  },
  {
    label: { id: "Prognosis", en: "Prognosis" },
    title: { id: "Umumnya membaik dalam beberapa hari", en: "Usually improves within days" },
    copy: {
      id: "Common cold biasanya membaik dalam 7-10 hari, walau batuk ringan dapat bertahan lebih lama. Pemulihan lebih nyaman bila tubuh mendapat tidur cukup, cairan, dan tidak dipaksa bekerja terlalu berat saat sakit.",
      en: "The common cold usually improves within 7-10 days, although a mild cough can last longer. Recovery is more comfortable when the body gets enough sleep, fluids, and is not pushed too hard while sick.",
    },
  },
  {
    label: { id: "Pencegahan", en: "Prevention" },
    title: { id: "Kebiasaan kecil yang membantu", en: "Small habits that help" },
    copy: {
      id: "Cuci tangan, hindari menyentuh wajah dengan tangan kotor, tutup batuk dan bersin, jaga ventilasi, gunakan masker saat sedang sakit, dan istirahat di rumah bila memungkinkan. Pencegahan juga melindungi orang lain di sekitar kita.",
      en: "Wash hands, avoid touching the face with dirty hands, cover coughs and sneezes, improve ventilation, wear a mask when sick, and rest at home when possible. Prevention also protects people around us.",
    },
  },
];

const web3Issues: Web3Issue[] = [
  createWeb3Issue("sleep-deprivation", "Kurang Tidur", "Sleep Deprivation", "lime", [
    ["Mengapa terjadi di Web3", "Why it happens in Web3", "Market berjalan 24/7, komunitas global aktif lintas zona waktu, listing token sering terjadi larut malam, dan Discord atau Telegram tidak pernah benar-benar tidur. Banyak orang mengorbankan tidur karena takut melewatkan peluang.", "Markets run 24/7, global communities operate across time zones, token listings can happen late at night, and Discord or Telegram never fully sleep. Many people sacrifice sleep because they fear missing opportunities."],
    ["Dampak jangka pendek", "Short-term impact", "Kurang tidur membuat fokus menurun, mudah lupa, reaksi lebih lambat, mudah marah, dan produktivitas turun. Kesalahan kecil saat membaca data atau mengambil keputusan bisa lebih mudah terjadi.", "Poor sleep reduces focus, memory, reaction speed, emotional control, and productivity. Small mistakes while reading data or making decisions become more likely."],
    ["Dampak jangka panjang", "Long-term impact", "Jika berlangsung lama, kurang tidur berkaitan dengan risiko hipertensi, diabetes tipe 2, berat badan naik, daya tahan tubuh melemah, depresi, dan kecemasan.", "Over time, sleep deprivation is linked with higher risk of hypertension, type 2 diabetes, weight gain, weaker immunity, depression, and anxiety."],
    ["Solusi praktis", "Practical solutions", "Prioritaskan tidur 7-9 jam, buat jam tidur yang konsisten, matikan notifikasi saat tidur, dan jangan normalisasi begadang sebagai budaya produktivitas.", "Prioritize 7-9 hours of sleep, keep a regular sleep schedule, turn off notifications during sleep, and do not normalize all-night work as productivity culture."],
    ["Pesan kunci", "Key message", "Tidur hanya 4-5 jam dapat menurunkan performa berpikir hingga mirip kondisi intoksikasi ringan. Tidur adalah fondasi kerja otak.", "Sleeping only 4-5 hours can reduce thinking performance to a level similar to mild intoxication. Sleep is a foundation for brain performance."],
  ]),
  createWeb3Issue("digital-eye-strain", "Mata Lelah", "Digital Eye Strain", "blue", [
    ["Mengapa terjadi", "Why it happens", "Jam coding panjang, Discord, proposal governance, chart watching, dan membaca thread membuat mata jarang beristirahat.", "Long coding hours, Discord, governance proposals, chart watching, and reading threads mean the eyes rarely rest."],
    ["Gejala", "Symptoms", "Mata kering, perih, penglihatan buram sementara, sakit kepala, dan mata terasa berat sering muncul setelah paparan layar yang panjang.", "Dry eyes, sore eyes, temporary blurred vision, headaches, and heavy eyes commonly appear after long screen exposure."],
    ["Penjelasan sederhana", "Simple explanation", "Saat fokus ke layar, frekuensi berkedip turun. Lapisan air mata lebih cepat menguap sehingga mata terasa kering dan tidak nyaman.", "When focusing on screens, blinking frequency decreases. The tear film evaporates faster, making the eyes dry and uncomfortable."],
    ["Solusi praktis", "Practical solutions", "Gunakan aturan 20-20-20, berkedip lebih sering, atur pencahayaan ruangan, dan beri waktu istirahat mata secara teratur.", "Use the 20-20-20 rule, blink more often, improve room lighting, and rest the eyes regularly."],
    ["Pesan kunci", "Key message", "Masalah utamanya bukan radiasi layar, tetapi paparan layar yang terlalu lama tanpa jeda.", "The main issue is not screen radiation, but long uninterrupted screen exposure."],
  ]),
  createWeb3Issue("neck-back-pain", "Nyeri Leher dan Punggung", "Neck and Back Pain", "orange", [
    ["Mengapa terjadi", "Why it happens", "Bekerja dari sofa, kasur, laptop tanpa meja ergonomis, dan terlalu lama menunduk membuat otot leher, bahu, dan punggung bekerja berlebihan.", "Working from a sofa, bed, laptop without an ergonomic desk, and looking down for long hours overload the neck, shoulder, and back muscles."],
    ["Gejala", "Symptoms", "Leher kaku, bahu tegang, nyeri punggung bawah, dan sakit kepala tegang sering muncul setelah duduk lama.", "Stiff neck, tight shoulders, lower back pain, and tension headaches often appear after long sitting."],
    ["Dampak jangka panjang", "Long-term impact", "Jika kebiasaan ini berlanjut, postur dapat memburuk, nyeri menjadi kronis, dan produktivitas turun karena tubuh terus merasa tidak nyaman.", "If this continues, posture can worsen, pain can become chronic, and productivity can drop because the body stays uncomfortable."],
    ["Solusi praktis", "Practical solutions", "Berdiri setiap 30-60 menit, gunakan kursi dengan penyangga punggung, posisikan monitor sejajar mata, dan lakukan peregangan ringan.", "Stand every 30-60 minutes, use a chair with back support, keep the monitor at eye level, and stretch regularly."],
    ["Pesan kunci", "Key message", "Tubuh manusia berevolusi untuk bergerak, bukan duduk sepanjang hari.", "The human body evolved to move, not to sit all day."],
  ]),
  createWeb3Issue("stress-anxiety", "Stres dan Kecemasan", "Stress and Anxiety", "purple", [
    ["Mengapa terjadi", "Why it happens", "Harga yang volatil, kompetisi tinggi, FOMO, tekanan performa proyek, dan ekspektasi komunitas dapat membuat sistem stres aktif terus-menerus.", "Volatile prices, intense competition, FOMO, project performance pressure, and community expectations can keep the stress system constantly active."],
    ["Gejala", "Symptoms", "Sulit tidur, jantung berdebar, sulit fokus, mudah panik, dan mudah tersinggung dapat muncul saat stres menumpuk.", "Trouble sleeping, palpitations, poor focus, panic, and irritability can appear when stress builds up."],
    ["Penjelasan medis sederhana", "Simple medical explanation", "Tubuh melepas hormon stres seperti kortisol dan adrenalin. Jika berlangsung lama, efeknya dapat memengaruhi kesehatan fisik dan mental.", "The body releases stress hormones such as cortisol and adrenaline. If this continues over time, it can affect physical and mental health."],
    ["Solusi praktis", "Practical solutions", "Batasi waktu memantau market, olahraga teratur, latihan relaksasi, dan pertahankan aktivitas di luar Web3.", "Limit market-watching time, exercise regularly, practice relaxation, and keep activities outside Web3."],
    ["Pesan kunci", "Key message", "Tidak setiap red candle membutuhkan respons emosional.", "Not every red candle needs an emotional response."],
  ]),
  createWeb3Issue("burnout", "Burnout", "Burnout", "pink", [
    ["Bedanya dengan stres", "Difference from stress", "Stres terasa seperti: saya masih bisa bekerja, tetapi tertekan. Burnout terasa seperti: saya tidak lagi punya energi untuk peduli.", "Stress feels like: I can still work, but I feel pressured. Burnout feels like: I no longer have the energy to care."],
    ["Tanda", "Signs", "Kelelahan berat, hilang motivasi, sinis terhadap pekerjaan, dan produktivitas menurun adalah tanda yang perlu diperhatikan.", "Exhaustion, loss of motivation, cynicism toward work, and lower productivity are signs to notice."],
    ["Mengapa umum di Web3", "Why it is common in Web3", "Batas kerja dan hidup pribadi kabur. Discord, Telegram, komunitas, dan market aktif 24/7 sehingga tubuh tidak pernah benar-benar pulih.", "The boundary between work and personal life is blurred. Discord, Telegram, communities, and markets stay active 24/7, so the body never fully recovers."],
    ["Solusi praktis", "Practical solutions", "Tetapkan jam kerja, ambil waktu istirahat, delegasikan tugas, dan jadwalkan hari tanpa pekerjaan.", "Set working hours, take time off, delegate tasks, and schedule days off."],
    ["Pesan kunci", "Key message", "Burnout bukan kelemahan. Burnout adalah sinyal bahwa tubuh dan pikiran butuh pemulihan.", "Burnout is not weakness. It is a signal that the body and mind need recovery."],
  ]),
  createWeb3Issue("physical-inactivity", "Kurang Aktivitas Fisik", "Physical Inactivity", "lime", [
    ["Mengapa penting", "Why it matters", "Terlalu banyak duduk berkaitan dengan penyakit jantung, diabetes, obesitas, dan risiko kematian dini, bahkan pada orang yang berolahraga secara teratur.", "Too much sitting is linked with heart disease, diabetes, obesity, and early death, even in people who exercise regularly."],
    ["Efek awal", "Early effects", "Mudah lelah, berat badan naik, kebugaran menurun, dan tubuh terasa kaku dapat menjadi sinyal awal kurang gerak.", "Getting tired easily, weight gain, lower fitness, and stiffness can be early signs of too little movement."],
    ["Solusi praktis", "Practical solutions", "Targetkan minimal 150 menit aktivitas fisik per minggu, berjalan saat online meeting, gunakan standing desk bila memungkinkan, dan pilih tangga jika aman.", "Aim for at least 150 minutes of physical activity per week, walk during online meetings, use a standing desk if possible, and take the stairs when safe."],
    ["Penjelasan sederhana", "Simple explanation", "Otot membantu tubuh menggunakan gula dan energi. Saat duduk terlalu lama, sistem ini bekerja lebih lambat.", "Muscles help the body use sugar and energy. When sitting too long, this system works more slowly."],
    ["Pesan kunci", "Key message", "Tubuh tidak tahu kamu sedang trading, coding, atau scrolling. Tubuh hanya tahu kamu sudah duduk terlalu lama.", "Your body does not know whether you are trading, coding, or scrolling. It only knows you have been sitting too long."],
  ]),
  createWeb3Issue("excessive-caffeine", "Konsumsi Kafein Berlebihan", "Excessive Caffeine Intake", "orange", [
    ["Mengapa umum", "Why it is common", "Budaya 'one more coffee', grinding semalaman, dan anggapan tidur itu untuk orang lemah membuat kafein sering dipakai untuk menutupi kurang istirahat.", "The culture of one more coffee, grinding all night, and sleep-is-for-losers makes caffeine a common way to cover lack of rest."],
    ["Efek", "Effects", "Kafein berlebihan dapat menyebabkan jantung berdebar, tremor, sulit tidur, kecemasan meningkat, dan gejala refluks atau asam lambung.", "Too much caffeine can cause palpitations, tremor, trouble sleeping, increased anxiety, and reflux or stomach acid symptoms."],
    ["Solusi praktis", "Practical solutions", "Batasi asupan kafein, cukup minum air, dan jangan gunakan kopi sebagai pengganti tidur.", "Limit caffeine intake, drink enough water, and do not use coffee as a replacement for sleep."],
    ["Penjelasan sederhana", "Simple explanation", "Kafein dapat menunda rasa kantuk, tetapi tidak menghapus kebutuhan biologis tubuh untuk tidur.", "Caffeine can delay sleepiness, but it does not remove the body's biological need for sleep."],
    ["Pesan kunci", "Key message", "Kopi bisa membantu fokus sesaat, tetapi pemulihan tetap membutuhkan tidur.", "Coffee can support short-term focus, but recovery still needs sleep."],
  ]),
  createWeb3Issue("irregular-eating", "Pola Makan Tidak Teratur", "Irregular Eating Pattern", "pink", [
    ["Mengapa umum", "Why it is common", "Deadline, launch, market crash, dan meeting membuat makan sering dianggap prioritas rendah.", "Deadlines, launches, market crashes, and meetings can make eating feel like a low priority."],
    ["Efek", "Effects", "Pola makan tidak teratur dapat berkaitan dengan berat badan naik, masalah pencernaan, konsentrasi turun, dan risiko penyakit metabolik lebih tinggi.", "Irregular eating can be linked with weight gain, digestive issues, lower concentration, and higher metabolic disease risk."],
    ["Solusi praktis", "Practical solutions", "Jadwalkan waktu makan, tambah protein dan serat, kurangi makanan ultra-proses, dan siapkan camilan sehat.", "Schedule meals, increase protein and fiber, reduce ultra-processed foods, and prepare healthy snacks."],
    ["Penjelasan sederhana", "Simple explanation", "Otak butuh energi stabil. Saat makan tidak teratur, fokus dan mood bisa ikut naik turun.", "The brain needs stable energy. When meals are irregular, focus and mood can fluctuate."],
    ["Pesan kunci", "Key message", "Tubuh butuh nutrisi konsisten agar otak bisa bekerja dengan baik.", "The body needs consistent nutrition to keep the brain performing well."],
  ]),
  createWeb3Issue("social-isolation", "Isolasi Sosial", "Social Isolation", "blue", [
    ["Mengapa terjadi", "Why it happens", "Seseorang bisa berinteraksi dengan ribuan akun, aktif di banyak server, dan ikut banyak spaces, tetapi tetap merasa kesepian.", "A person may interact with thousands of accounts, be active in many servers, and join many spaces, yet still feel lonely."],
    ["Dampak", "Effects", "Isolasi sosial berkaitan dengan risiko depresi, kecemasan, dan kualitas hidup yang lebih rendah.", "Social isolation is linked with higher risk of depression, anxiety, and lower quality of life."],
    ["Solusi praktis", "Practical solutions", "Jaga hubungan keluarga, temui teman secara langsung, dan ikuti aktivitas offline yang membuat tubuh dan emosi terasa hadir.", "Maintain family relationships, meet friends in person, and join offline activities that make the body and emotions feel present."],
    ["Penjelasan sederhana", "Simple explanation", "Interaksi digital bisa berguna, tetapi manusia tetap membutuhkan koneksi yang terasa aman, nyata, dan timbal balik.", "Digital interaction can be useful, but humans still need connection that feels safe, real, and reciprocal."],
    ["Pesan kunci", "Key message", "Koneksi internet yang kuat tidak selalu berarti koneksi sosial yang kuat.", "A strong internet connection does not always mean a strong social connection."],
  ]),
  createWeb3Issue("doomscrolling", "Doomscrolling dan Information Overload", "Doomscrolling and Information Overload", "purple", [
    ["Mengapa terjadi", "Why it happens", "Dalam satu jam seseorang bisa membuka X, Discord, Telegram, CoinMarketCap, berita crypto, dan forum komunitas. Otak menerima terlalu banyak sinyal sekaligus.", "Within one hour, a person may open X, Discord, Telegram, CoinMarketCap, crypto news, and community forums. The brain receives too many signals at once."],
    ["Efek", "Effects", "Sulit fokus, lelah mental, kecemasan meningkat, dan gangguan tidur dapat muncul saat informasi masuk tanpa jeda.", "Poor focus, mental fatigue, increased anxiety, and sleep problems can appear when information arrives without breaks."],
    ["Solusi praktis", "Practical solutions", "Jadwalkan waktu khusus membaca berita, matikan notifikasi yang tidak penting, dan gunakan waktu bebas layar.", "Schedule specific news-reading time, turn off unnecessary notifications, and use screen-free time."],
    ["Penjelasan sederhana", "Simple explanation", "Otak butuh waktu untuk memproses informasi, bukan hanya menerima informasi.", "The brain needs time to process information, not only receive information."],
    ["Pesan kunci", "Key message", "Tidak semua update harus diproses saat itu juga.", "Not every update needs to be processed immediately."],
  ]),
];

function App() {
  const [route, setRoute] = useState<RouteInfo>(() => parseRoute(window.location.pathname));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileCreated, setProfileCreated] = useState(false);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyForm);
  const [profileError, setProfileError] = useState("");
  const [completedDiseaseIds, setCompletedDiseaseIds] = useState<number[]>([]);
  const [completedMap, setCompletedMap] = useState<Record<number, boolean>>({});
  const [badgeMap, setBadgeMap] = useState<Record<number, boolean>>({});
  const [canBadgeMap, setCanBadgeMap] = useState<Record<number, boolean>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [classifierKind, setClassifierKind] = useState<ClassifierKind>("bp");
  const [bp, setBp] = useState({ systolic: "", diastolic: "" });
  const [sugar, setSugar] = useState({ value: "", mode: "fasting" });
  const [bmi, setBmi] = useState({ height: "", weight: "" });
  const [selectedScenario, setSelectedScenario] = useState<AgentScenario>(agentScenarios[0]);
  const [agentLanguage, setAgentLanguage] = useState(0);
  const [agentReady, setAgentReady] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState("");
  const [readNonce, setReadNonce] = useState(0);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const config = useConfig();
  const { connectors, connectAsync } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const account = address ?? null;
  const ritualConfigured = config.chains.some((chain) => chain.id === RITUAL_CHAIN_ID);
  const wrongNetwork = Boolean(account && chainId !== RITUAL_CHAIN_ID);
  const currentDisease = route.name === "disease" || route.name === "quiz" ? diseaseBySlug(route.slug) : diseases[0];
  const currentWeb3Issue = route.name === "web3Health" ? web3IssueBySlug(route.slug) : web3Issues[0];
  const profileCreatedRead = useReadContract({
    address: CONSTUAL_CORE_ADDRESS,
    abi: constualAbi,
    functionName: "isProfileCreated",
    args: account ? [account] : undefined,
    chainId: RITUAL_CHAIN_ID,
    query: { enabled: Boolean(account && chainId === RITUAL_CHAIN_ID) },
  });

  useEffect(() => {
    if (typeof profileCreatedRead.data === "boolean") {
      setProfileCreated(profileCreatedRead.data);
    }
  }, [profileCreatedRead.data]);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, "", path);
    setRoute(parseRoute(path));
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const showToast = useCallback((message: string, kind: NonNullable<Toast>["kind"] = "info") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 4600);
  }, []);

  const connectWallet = async () => {
    const connector = connectors[0];
    if (!connector) {
      showToast("Install a browser wallet to connect.", "error");
      return;
    }

    try {
      await connectAsync({ connector });
      setReadNonce((value) => value + 1);
    } catch (error) {
      console.error(error);
      showToast("Wallet connection was cancelled.", "error");
    }
  };

  const disconnectWallet = () => {
    disconnect();
    setProfileCreated(false);
    setProfile(emptyProfile);
    setProfileForm(emptyForm);
    setCompletedDiseaseIds([]);
    setCompletedMap({});
    setBadgeMap({});
    setCanBadgeMap({});
    setLeaderboard([]);
    setReadNonce((value) => value + 1);
    showToast("Wallet disconnected.", "success");
  };

  const switchNetwork = async () => {
    try {
      if (!ritualConfigured) throw new Error("Ritual Testnet is missing from wagmi config.");
      await switchChainAsync({ chainId: RITUAL_CHAIN_ID });
      await profileCreatedRead.refetch();
      setReadNonce((value) => value + 1);
    } catch (error) {
      console.error(error);
      await switchToRitualTestnet();
      await profileCreatedRead.refetch();
      setReadNonce((value) => value + 1);
    }
  };

  const loadProfile = useCallback(async () => {
    if (!account) {
      setProfileCreated(false);
      setProfile(emptyProfile);
      setProfileForm(emptyForm);
      return;
    }

    setProfileError("");
    try {
      const created = (await publicClient.readContract({
        address: CONSTUAL_CORE_ADDRESS,
        abi: constualAbi,
        functionName: "isProfileCreated",
        args: [account],
      })) as boolean;

      setProfileCreated(created);
      if (!created) {
        setProfile(emptyProfile);
        setProfileForm(emptyForm);
        setCompletedDiseaseIds([]);
        setCompletedMap({});
        setBadgeMap({});
        setCanBadgeMap({});
        return;
      }

      const rawProfile = await publicClient.readContract({
        address: CONSTUAL_CORE_ADDRESS,
        abi: constualAbi,
        functionName: "getProfile",
        args: [account],
      });
      const nextProfile = normalizeProfile(rawProfile);
      setProfile(nextProfile);
      setProfileForm({
        displayName: nextProfile.displayName,
        constualUsername: nextProfile.constualUsername,
        xUsername: nextProfile.xUsername,
        preferredLanguage: nextProfile.preferredLanguage,
      });

      const [completedIds, progressEntries] = await Promise.all([
        publicClient
          .readContract({
            address: CONSTUAL_CORE_ADDRESS,
            abi: constualAbi,
            functionName: "getCompletedDiseaseIds",
            args: [account],
          })
          .then((ids) => (ids as bigint[]).map(Number))
          .catch(() => []),
        Promise.all(
          diseases.map(async (disease) => {
            const [completed, claimed, canClaim] = await Promise.all([
              publicClient.readContract({
                address: CONSTUAL_CORE_ADDRESS,
                abi: constualAbi,
                functionName: "hasCompletedQuest",
                args: [account, BigInt(disease.id)],
              }),
              publicClient.readContract({
                address: CONSTUAL_CORE_ADDRESS,
                abi: constualAbi,
                functionName: "hasClaimedBadge",
                args: [account, BigInt(disease.id)],
              }),
              publicClient.readContract({
                address: CONSTUAL_CORE_ADDRESS,
                abi: constualAbi,
                functionName: "canClaimBadge",
                args: [account, BigInt(disease.id)],
              }),
            ]);
            return [disease.id, Boolean(completed), Boolean(claimed), Boolean(canClaim)] as const;
          }),
        ),
      ]);

      setCompletedDiseaseIds(completedIds);
      setCompletedMap(Object.fromEntries(progressEntries.map(([id, completed]) => [id, completed])));
      setBadgeMap(Object.fromEntries(progressEntries.map(([id, , claimed]) => [id, claimed])));
      setCanBadgeMap(Object.fromEntries(progressEntries.map(([id, , , canClaim]) => [id, canClaim])));
    } catch (error) {
      console.error(error);
      setProfileError("Constual Passport could not be read. ABI mismatch or Ritual RPC issue suspected.");
      showToast("Passport read failed. Try the retry button.", "error");
    }
  }, [account, readNonce, showToast]);

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardError("");
    try {
      const count = (await publicClient.readContract({
        address: CONSTUAL_CORE_ADDRESS,
        abi: constualAbi,
        functionName: "getUserCount",
      })) as bigint;
      const limit = count > 40n ? 40n : count;
      if (limit === 0n) {
        setLeaderboard([]);
        return;
      }

      const users = (await publicClient.readContract({
        address: CONSTUAL_CORE_ADDRESS,
        abi: constualAbi,
        functionName: "getUsers",
        args: [0n, limit],
      })) as Address[];

      const rows = await Promise.all(
        users.map(async (address) => {
          const [rawProfile, accuracy] = await Promise.all([
            publicClient.readContract({
              address: CONSTUAL_CORE_ADDRESS,
              abi: constualAbi,
              functionName: "getProfile",
              args: [address],
            }),
            publicClient.readContract({
              address: CONSTUAL_CORE_ADDRESS,
              abi: constualAbi,
              functionName: "getAccuracy",
              args: [address],
            }),
          ]);
          return { ...normalizeProfile(rawProfile), accuracy: toBigInt(accuracy), address };
        }),
      );
      setLeaderboard(rows.sort((a, b) => Number(b.xp - a.xp)));
    } catch (error) {
      console.error(error);
      setLeaderboard([]);
      setLeaderboardError("Leaderboard reads are unavailable right now. Ritual RPC or contract reads may be busy.");
    }
  }, []);

  useEffect(() => {
    const handlePop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  useEffect(() => {
    if (account && chainId === RITUAL_CHAIN_ID) {
      loadProfile();
    } else if (!account) {
      setProfileCreated(false);
      setProfile(emptyProfile);
      setProfileForm(emptyForm);
    }
  }, [account, chainId, loadProfile]);

  useEffect(() => {
    if (route.name === "leaderboard" || route.name === "app") {
      loadLeaderboard();
    }
  }, [route.name, loadLeaderboard]);

  const guardedWrite = async (label: string, action: () => Promise<void>, requiresProfile = true) => {
    if (!account) {
      showToast("Connect your wallet first.", "error");
      return;
    }
    if (wrongNetwork) {
      showToast("Please switch to Ritual Testnet.", "error");
      return;
    }
    if (requiresProfile && !profileCreated) {
      showToast("Create your Constual Passport first.", "error");
      navigate("/passport");
      return;
    }

    // pre-flight: a wallet with 0 RITUAL can't pay gas — fail early with a clear
    // message instead of a cryptic "Internal JSON-RPC error" from the wallet.
    try {
      const balance = await publicClient.getBalance({ address: account });
      if (balance === 0n) {
        showToast("Your wallet has 0 RITUAL. Get testnet RITUAL gas from the Ritual faucet, then try again.", "error");
        return;
      }
    } catch {
      /* balance read is best-effort; don't block the tx if it fails */
    }

    setBusy(label);
    try {
      showToast("Confirm the transaction in your wallet.", "info");
      await action();
      showToast("Transaction confirmed. Refreshing Constual reads.", "success");
      await profileCreatedRead.refetch();
      setReadNonce((value) => value + 1);
      await Promise.all([loadProfile(), loadLeaderboard()]);
    } catch (error) {
      console.error(error);
      showToast(readableError(error), "error");
    } finally {
      setBusy("");
    }
  };

  const submitProfile = async () => {
    const normalizedForm = normalizeForm(profileForm);
    const validationError = validateProfileForm(normalizedForm);
    if (validationError) {
      showToast(validationError, "error");
      return;
    }

    await guardedWrite(
      "profile",
      async () => {
        const usernameChanged = normalizedForm.constualUsername !== profile.constualUsername;
        if (!profileCreated || usernameChanged) {
          const available = (await publicClient.readContract({
            address: CONSTUAL_CORE_ADDRESS,
            abi: constualAbi,
            functionName: "isConstualUsernameAvailable",
            args: [normalizedForm.constualUsername],
          })) as boolean;

          if (!available) {
            throw new Error("Constual username is not available.");
          }
        }

        await sendConstualTransaction(account!, writeContractAsync, profileCreated ? "updateProfile" : "createProfile", [
          normalizedForm.displayName,
          normalizedForm.constualUsername,
          normalizedForm.xUsername,
          normalizedForm.preferredLanguage,
        ]);
        await loadProfile();
      },
      false,
    );
  };

  const completeQuest = (disease: Disease, scoreNumber: number, languageUsed: number) =>
    guardedWrite("quest", async () => {
      if (!diseases.some((item) => item.id === disease.id) || disease.id === 0) {
        throw new Error("Invalid diseaseId.");
      }
      const score = BigInt(scoreNumber);
      if (score < 60n || score > 100n) {
        throw new Error("Score must be between 60 and 100.");
      }
      const alreadyCompleted = (await publicClient.readContract({
        address: CONSTUAL_CORE_ADDRESS,
        abi: constualAbi,
        functionName: "hasCompletedQuest",
        args: [account!, BigInt(disease.id)],
      })) as boolean;
      if (alreadyCompleted) {
        throw new Error("Quest already completed.");
      }
      await sendConstualTransaction(account!, writeContractAsync, "completeQuest", [BigInt(disease.id), score, languageUsed]);
    });

  const claimBadge = (diseaseId: number) =>
    guardedWrite("badge", async () => {
      if (!diseases.some((item) => item.id === diseaseId) || diseaseId === 0) {
        throw new Error("Invalid diseaseId.");
      }
      const [alreadyClaimed, canClaim] = await Promise.all([
        publicClient.readContract({
          address: CONSTUAL_CORE_ADDRESS,
          abi: constualAbi,
          functionName: "hasClaimedBadge",
          args: [account!, BigInt(diseaseId)],
        }) as Promise<boolean>,
        publicClient.readContract({
          address: CONSTUAL_CORE_ADDRESS,
          abi: constualAbi,
          functionName: "canClaimBadge",
          args: [account!, BigInt(diseaseId)],
        }) as Promise<boolean>,
      ]);
      if (alreadyClaimed) throw new Error("Badge already claimed.");
      if (!canClaim) throw new Error("Badge is not claimable yet.");
      await sendConstualTransaction(account!, writeContractAsync, "claimBadge", [BigInt(diseaseId)]);
    });

  const classifierResult = useMemo(() => {
    if (classifierKind === "bp") {
      const systolic = Number(bp.systolic);
      const diastolic = Number(bp.diastolic);
      if (!systolic || !diastolic) return null;
      if (systolic >= 180 || diastolic >= 120) return { type: 1, category: "bp_very_high", label: "Very high range" };
      if (systolic >= 140 || diastolic >= 90) return { type: 1, category: "bp_high", label: "High range" };
      if (systolic >= 120 || diastolic >= 80) return { type: 1, category: "bp_elevated", label: "Elevated range" };
      return { type: 1, category: "bp_normal", label: "Normal range" };
    }

    if (classifierKind === "sugar") {
      const value = Number(sugar.value);
      if (!value) return null;
      if (value < 70) return { type: 2, category: "sugar_low", label: "Low range" };
      if (sugar.mode === "random" && value >= 200) return { type: 2, category: "sugar_random_high", label: "Random high range" };
      if (sugar.mode === "fasting" && value >= 126) return { type: 2, category: "sugar_fasting_high", label: "Fasting high range" };
      if (sugar.mode === "fasting" && value >= 100) return { type: 2, category: "sugar_fasting_elevated", label: "Fasting elevated range" };
      return { type: 2, category: "sugar_normal", label: "Education-normal range" };
    }

    const heightM = Number(bmi.height) / 100;
    const weight = Number(bmi.weight);
    if (!heightM || !weight) return null;
    const value = weight / (heightM * heightM);
    if (value < 18.5) return { type: 3, category: "bmi_underweight", label: `Underweight BMI ${value.toFixed(1)}` };
    if (value < 25) return { type: 3, category: "bmi_normal", label: `Normal BMI ${value.toFixed(1)}` };
    if (value < 30) return { type: 3, category: "bmi_overweight", label: `Overweight BMI ${value.toFixed(1)}` };
    return { type: 3, category: "bmi_obesity", label: `Obesity-range BMI ${value.toFixed(1)}` };
  }, [bmi.height, bmi.weight, bp.diastolic, bp.systolic, classifierKind, sugar.mode, sugar.value]);

  const generateAgent = (scenario: AgentScenario) => {
    setSelectedScenario(scenario);
    setAgentReady(false);
    window.setTimeout(() => setAgentReady(true), 760);
  };

  const recordAgentGuide = () =>
    guardedWrite("agent", async () => {
      await sendConstualTransaction(account!, writeContractAsync, "recordAgentGuide", [
        BigInt(selectedScenario.id),
        agentLanguage,
        guideProofHash(selectedScenario.id, agentLanguage, account!),
      ]);
    });

  const page = renderRoute({
    route,
    navigate,
    account,
    connectWallet,
    wrongNetwork,
    profile,
    profileCreated,
    profileForm,
    setProfileForm,
    profileError,
    loadProfile,
    submitProfile,
    busy,
    completedDiseaseIds,
    completedMap,
    badgeMap,
    canBadgeMap,
    completeQuest,
    claimBadge,
    classifierKind,
    setClassifierKind,
    bp,
    setBp,
    sugar,
    setSugar,
    bmi,
    setBmi,
    classifierResult,
    selectedScenario,
    selectedAgentScenario: selectedScenario,
    agentLanguage,
    setAgentLanguage,
    agentReady,
    generateAgent,
    recordAgentGuide,
    leaderboard,
    leaderboardError,
    loadLeaderboard,
    currentDisease,
    currentWeb3Issue,
  });

  if (route.name === "play") {
    return <GameCanvas onExit={() => navigate("/app")} />;
  }

  return (
    <main className={route.name === "landing" ? "site landing-mode" : "site app-mode"}>
      <Navbar
        route={route}
        navigate={navigate}
        account={account}
        connectWallet={connectWallet}
        wrongNetwork={wrongNetwork}
        switchNetwork={switchNetwork}
        disconnectWallet={disconnectWallet}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        profile={profile}
      />
      {route.name !== "landing" && wrongNetwork && <NetworkGate switchNetwork={switchNetwork} />}
      {page}
      {route.name !== "landing" && <MobileBottomNav route={route} navigate={navigate} />}
      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
    </main>
  );
}

type RenderProps = {
  route: RouteInfo;
  navigate: (path: string) => void;
  account: Address | null;
  connectWallet: () => Promise<void>;
  wrongNetwork: boolean;
  profile: Profile;
  profileCreated: boolean;
  profileForm: ProfileForm;
  setProfileForm: (form: ProfileForm) => void;
  profileError: string;
  loadProfile: () => Promise<void>;
  submitProfile: () => Promise<void>;
  busy: string;
  completedDiseaseIds: number[];
  completedMap: Record<number, boolean>;
  badgeMap: Record<number, boolean>;
  canBadgeMap: Record<number, boolean>;
  completeQuest: (disease: Disease, score: number, languageUsed: number) => void;
  claimBadge: (diseaseId: number) => void;
  classifierKind: ClassifierKind;
  setClassifierKind: (kind: ClassifierKind) => void;
  bp: { systolic: string; diastolic: string };
  setBp: (value: { systolic: string; diastolic: string }) => void;
  sugar: { value: string; mode: string };
  setSugar: (value: { value: string; mode: string }) => void;
  bmi: { height: string; weight: string };
  setBmi: (value: { height: string; weight: string }) => void;
  classifierResult: { type: number; category: string; label: string } | null;
  selectedScenario: AgentScenario;
  selectedAgentScenario: AgentScenario;
  agentLanguage: number;
  setAgentLanguage: (language: number) => void;
  agentReady: boolean;
  generateAgent: (scenario: AgentScenario) => void;
  recordAgentGuide: () => void;
  leaderboard: LeaderboardRow[];
  leaderboardError: string;
  loadLeaderboard: () => void;
  currentDisease: Disease;
  currentWeb3Issue: Web3Issue;
};

function renderRoute(props: RenderProps) {
  switch (props.route.name) {
    case "landing":
      return <LandingPage navigate={props.navigate} />;
    case "app":
      return <DashboardPage {...props} />;
    case "play":
      return null;
    case "library":
      return <LibraryPage navigate={props.navigate} completedMap={props.completedMap} badgeMap={props.badgeMap} />;
    case "disease":
      return <DiseasePage disease={props.currentDisease} navigate={props.navigate} completed={props.completedMap[props.currentDisease.id]} />;
    case "quiz":
      return <QuizPage {...props} disease={props.currentDisease} />;
    case "web3Health":
      return <Web3HealthPage issue={props.currentWeb3Issue} navigate={props.navigate} />;
    case "classifier":
      return <ClassifierPage {...props} />;
    case "agent":
      return <AgentPage {...props} />;
    case "passport":
      return <PassportPage {...props} />;
    case "leaderboard":
      return <LeaderboardPage {...props} />;
    case "about":
      return <AboutPage navigate={props.navigate} />;
  }
}

function LandingPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <>
      <section className="landing-hero">
        <div className="hero-copy">
          <motion.p className="eyebrow" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            Constual on Ritual Testnet
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            Your caring health companion.
          </motion.h1>
          <motion.p className="hero-subtitle" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
            Learn health topics, try education-focused classifiers, ask a bilingual agent, and build proof of learning.
          </motion.p>
          <motion.div className="hero-actions" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
            <button className="btn btn-lime btn-xl" onClick={() => navigate("/app")} type="button">
              Enter Constual
              <ChevronRight size={19} />
            </button>
            <a className="btn btn-glass btn-xl" href="#features">
              Explore Features
            </a>
          </motion.div>
        </div>
        <HeroBuddyGroup />
      </section>

      <LandingSection id="features" title="Feature preview" copy="A visual learning passport, calm classifiers, bilingual guidance, badges, and Ritual proof.">
        <FeatureGrid navigate={navigate} />
      </LandingSection>

      <LandingSection id="how" title="How Constual Works" copy="One gentle loop from learning to proof.">
        <div className="steps-grid">
          {["Learn", "Check", "Ask Agent", "Quiz", "Earn Proof"].map((step, index) => (
            <motion.div className="step-card" key={step} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ delay: index * 0.06 }}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </motion.div>
          ))}
        </div>
      </LandingSection>

      <LandingSection id="safety" title="Safety by Design" copy="Education stays separate from diagnosis, treatment, and medical records.">
        <div className="safety-band">
          <ShieldCheck />
          <p>{safetyCopy}</p>
        </div>
      </LandingSection>

      <section className="enter-band">
        <WellnessCharacter tone="lime" />
        <h2>Ready to enter Constual?</h2>
        <button className="btn btn-dark btn-xl" onClick={() => navigate("/app")} type="button">
          Enter Constual
          <ChevronRight size={19} />
        </button>
      </section>
    </>
  );
}

function DashboardPage({ navigate, profile, profileCreated, completedDiseaseIds, leaderboard }: RenderProps) {
  return (
    <AppPage title="Constual App" kicker="Platform dashboard" action={<button className="btn btn-lime" onClick={() => navigate("/passport")} type="button">Open Passport</button>}>
      <section className="dashboard-hero card dark-card">
        <div>
          <p className="eyebrow">A caring health companion</p>
          <h2>{profileCreated ? `Welcome back, ${profile.displayName || profile.constualUsername}` : "Build your Constual Learning Passport"}</h2>
          <p>
            Learn, check, ask, quiz, and record privacy-safe learning proof on Ritual Testnet. No backend, no AI API,
            and no medical records.
          </p>
          <div className="hero-actions">
            <button className="btn btn-lime" onClick={() => navigate("/library")} type="button">Start Learning</button>
            <button className="btn btn-ghost-light" onClick={() => navigate("/agent")} type="button">Ask Agent</button>
          </div>
        </div>
        <HeroMiniMockup />
      </section>

      <div className="stats-grid">
        <Stat label="XP" value={formatBigint(profile.xp)} />
        <Stat label="Completed Modules" value={String(completedDiseaseIds.length || Number(profile.completedCount))} />
        <Stat label="Badges" value={formatBigint(profile.badgeCount)} />
        <Stat label="Leaderboard Rows" value={String(leaderboard.length)} />
      </div>

      <FeatureGrid navigate={navigate} />
    </AppPage>
  );
}

function LibraryPage({
  navigate,
  completedMap,
  badgeMap,
}: {
  navigate: (path: string) => void;
  completedMap: Record<number, boolean>;
  badgeMap: Record<number, boolean>;
}) {
  return (
    <AppPage title="Disease Library" kicker="Bilingual learning modules">
      <section className="library-section">
        <div className="library-heading">
          <div>
            <p className="eyebrow">Core Health Topics</p>
            <h2>Learn before you take the quiz.</h2>
          </div>
          <p>Structured bilingual modules for everyday health literacy, classifier context, and privacy-safe learning proof.</p>
        </div>
        <div className="module-grid">
          {diseases.map((disease, index) => (
            <motion.button
              className="module-card card"
              key={disease.id}
              onClick={() => navigate(`/disease/${slugForDisease(disease)}`)}
              type="button"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <DiseaseVisual diseaseId={disease.id} compact />
              <span>Core Topic - {disease.localName}</span>
              <h3>{disease.name}</h3>
              <p>{disease.summary}</p>
              <div className="status-row">
                <small>Estimated read: 6-8 min</small>
                <small>{completedMap[disease.id] ? "Quest complete" : "Start Learning"}</small>
                <small>{badgeMap[disease.id] ? "Badge claimed" : "Badge available after quiz"}</small>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      <section className="library-section web3-library">
        <div className="library-heading">
          <div>
            <p className="eyebrow">Web3 Health Issues</p>
            <h2>Healthy habits for a 24/7 digital community.</h2>
          </div>
          <p>Web3 builders do not need to leave technology to stay healthy. They need habits that let the body work well inside a fast, always-on environment.</p>
        </div>
        <div className="card web3-overview">
          <WellnessCharacter tone="lime" />
          <div>
            <h3>The four biggest root issues</h3>
            <p>Sleep deprivation, physical inactivity, chronic stress, and excessive screen exposure are interconnected. Over time, they can raise risk for hypertension, diabetes, obesity, mental health problems, and lower quality of life.</p>
          </div>
        </div>
        <div className="web3-module-grid">
          {web3Issues.map((issue, index) => (
            <motion.button
              className="card web3-module-card"
              key={issue.slug}
              onClick={() => navigate(`/web3-health-issues/${issue.slug}`)}
              type="button"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.025 }}
            >
              <Web3IssueVisual tone={issue.tone} index={index} />
              <span>Web3 Health - {issue.title.id}</span>
              <h3>{issue.title.en}</h3>
              <p>{issue.intro.en}</p>
              <small>{issue.readTime} - Start Learning</small>
            </motion.button>
          ))}
        </div>
      </section>
    </AppPage>
  );
}

function DiseasePage({
  disease,
  navigate,
  completed,
}: {
  disease: Disease;
  navigate: (path: string) => void;
  completed?: boolean;
}) {
  const [language, setLanguage] = useState(0);
  const [step, setStep] = useState(0);
  const sections = getLearningSections(disease.id, language);
  const activeSection = sections[step] ?? sections[0];

  return (
    <AppPage title={disease.name} kicker={disease.localName} action={<button className="btn btn-lime" onClick={() => navigate(`/disease/${slugForDisease(disease)}/quiz`)} type="button">Take Quiz</button>}>
      <section className="learning-layout">
        <div className="card learning-main">
          <div className="learning-topline">
            <disease.icon size={34} />
            <div className="language-toggle">
              <Languages size={18} />
              <button className={language === 0 ? "active" : ""} onClick={() => setLanguage(0)} type="button">Indonesia</button>
              <button className={language === 1 ? "active" : ""} onClick={() => setLanguage(1)} type="button">English</button>
            </div>
          </div>
          <div className="module-meta">
            <span>6 min</span>
            <span>Beginner</span>
            <span>Badge reward</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${((step + 1) / sections.length) * 100}%` }} />
          </div>
          <motion.div className="learning-card-flow" key={`${language}-${step}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <p className="eyebrow">{activeSection.label}</p>
            <h2>{activeSection.title}</h2>
            <p>{activeSection.copy}</p>
          </motion.div>
          <div className="lesson-points">
            <InfoPill title={language === 0 ? "Makna" : "Meaning"} copy={language === 0 ? "Pahami konteks edukasi sebelum mengambil keputusan kesehatan." : "Understand the education context before making health decisions."} />
            <InfoPill title={language === 0 ? "Kebiasaan" : "Care habit"} copy={language === 0 ? "Catat pola, amati gejala, dan diskusikan kekhawatiran dengan tenaga kesehatan." : "Track patterns, notice symptoms, and discuss concerns with qualified professionals."} />
            <InfoPill title="Safety" copy={safetyCopy} />
          </div>
          <div className="action-row">
            <button className="btn btn-secondary" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))} type="button">Previous</button>
            {step < sections.length - 1 ? (
              <button className="btn btn-lime" onClick={() => setStep((value) => Math.min(sections.length - 1, value + 1))} type="button">Next</button>
            ) : (
              <button className="btn btn-lime" onClick={() => navigate(`/disease/${slugForDisease(disease)}/quiz`)} type="button">Start Quiz</button>
            )}
          </div>
        </div>
        <aside className="card side-card">
          <DiseaseVisual diseaseId={disease.id} />
          <h3>{completed ? "Quest completed" : "Ready for quiz"}</h3>
          <p>{language === 0 ? "Baca kartu pembelajaran singkat, lalu lanjut ke kuis untuk bukti belajar." : "Read short learning cards, then continue to the quiz for proof-of-learning."}</p>
          <button className="btn btn-dark" onClick={() => navigate(`/disease/${slugForDisease(disease)}/quiz`)} type="button">Open Quiz</button>
        </aside>
      </section>
    </AppPage>
  );
}

function Web3HealthPage({ issue, navigate }: { issue: Web3Issue; navigate: (path: string) => void }) {
  const [language, setLanguage] = useState(0);
  const [step, setStep] = useState(0);
  const activeSection = issue.sections[step] ?? issue.sections[0];
  const progress = ((step + 1) / issue.sections.length) * 100;

  return (
    <AppPage title={language === 0 ? issue.title.id : issue.title.en} kicker="Web3 Health Issues">
      <section className="learning-layout web3-learning-layout">
        <div className="card learning-main web3-learning-main">
          <div className="learning-topline">
            <Web3IssueVisual tone={issue.tone} index={web3Issues.findIndex((item) => item.slug === issue.slug)} />
            <div className="language-toggle">
              <Languages size={18} />
              <button className={language === 0 ? "active" : ""} onClick={() => setLanguage(0)} type="button">Indonesia</button>
              <button className={language === 1 ? "active" : ""} onClick={() => setLanguage(1)} type="button">English</button>
            </div>
          </div>
          <p className="module-intro">{language === 0 ? issue.intro.id : issue.intro.en}</p>
          <div className="module-meta">
            <span>{issue.readTime}</span>
            <span>{language === 0 ? "Praktis" : "Practical"}</span>
            <span>{language === 0 ? "Web3 lifestyle" : "Web3 lifestyle"}</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          <motion.div className="learning-card-flow web3-card-flow" key={`${issue.slug}-${language}-${step}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <p className="eyebrow">{language === 0 ? activeSection.label.id : activeSection.label.en}</p>
            <h2>{language === 0 ? activeSection.title.id : activeSection.title.en}</h2>
            <p>{language === 0 ? activeSection.copy.id : activeSection.copy.en}</p>
          </motion.div>
          <div className="lesson-points">
            <InfoPill title={language === 0 ? "Makna" : "Meaning"} copy={language === 0 ? "Web3 sehat bukan berarti keluar dari teknologi, tetapi membangun batas dan ritme yang menjaga tubuh." : "Healthy Web3 does not mean leaving technology; it means building boundaries and rhythms that protect the body."} />
            <InfoPill title={language === 0 ? "Langkah kecil" : "Small step"} copy={language === 0 ? "Pilih satu kebiasaan yang bisa dilakukan hari ini, bukan mengubah semuanya sekaligus." : "Choose one habit you can practice today instead of changing everything at once."} />
            <InfoPill title="Safety" copy={language === 0 ? "Cari bantuan profesional bila keluhan berat, menetap, atau mengganggu aktivitas harian." : "Seek professional help when symptoms are severe, persistent, or disrupt daily life."} />
          </div>
          <div className="action-row">
            <button className="btn btn-secondary" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))} type="button">Previous</button>
            {step < issue.sections.length - 1 ? (
              <button className="btn btn-lime" onClick={() => setStep((value) => Math.min(issue.sections.length - 1, value + 1))} type="button">Next</button>
            ) : (
              <button className="btn btn-lime" onClick={() => navigate("/library")} type="button">Back to Library</button>
            )}
          </div>
        </div>
        <aside className="card side-card web3-side-card">
          <h3>{language === 0 ? "Ringkasan Web3 sehat" : "Healthy Web3 summary"}</h3>
          <p>
            {language === 0
              ? "Masalah tidur, gerak, stres, dan layar saling terhubung. Perbaikan kecil di satu area sering membantu area lain."
              : "Sleep, movement, stress, and screen exposure are connected. Small improvements in one area often help the others."}
          </p>
          <div className="not-grid">
            {(language === 0 ? ["Tidur", "Gerak", "Stres", "Layar"] : ["Sleep", "Movement", "Stress", "Screens"]).map((item) => <span key={item}>{item}</span>)}
          </div>
          <button className="btn btn-dark" onClick={() => navigate("/library")} type="button">Open Library</button>
        </aside>
      </section>
    </AppPage>
  );
}

function QuizPage({
  disease,
  completeQuest,
  claimBadge,
  busy,
  completedMap,
  badgeMap,
  canBadgeMap,
}: RenderProps & { disease: Disease }) {
  const [language, setLanguage] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const questions = getQuizQuestions(disease.id, language);
  const answered = questions.every((_, index) => answers[index] !== undefined);
  const correct = questions.reduce((total, question, index) => total + (answers[index] === question.answer ? 1 : 0), 0);
  const score = answered ? Math.round((correct / questions.length) * 100) : 0;
  const passed = score >= 60;

  return (
    <AppPage title={`${disease.name} Quiz`} kicker="Constual Learning Proof">
      <section className="card quiz-card">
        <div>
          <p className="eyebrow">{disease.localName}</p>
          <h2>{language === 0 ? "Jawab kuis singkat untuk bukti belajar." : "Answer a short quiz for learning proof."}</h2>
        </div>
        <div className="language-toggle">
          <Languages size={18} />
          <button className={language === 0 ? "active" : ""} onClick={() => setLanguage(0)} type="button">Indonesia</button>
          <button className={language === 1 ? "active" : ""} onClick={() => setLanguage(1)} type="button">English</button>
        </div>
        <div className="choice-list">
          {questions.map((question, questionIndex) => (
            <div className="quiz-question" key={question.question}>
              <strong>{questionIndex + 1}. {question.question}</strong>
              {question.options.map((option, optionIndex) => (
                <label className={answers[questionIndex] === optionIndex ? "choice active" : "choice"} key={option}>
                  <input
                    checked={answers[questionIndex] === optionIndex}
                    name={`quiz-${questionIndex}`}
                    onChange={() => setAnswers({ ...answers, [questionIndex]: optionIndex })}
                    type="radio"
                  />
                  <span>{option}</span>
                </label>
              ))}
              {answers[questionIndex] !== undefined && <p className="quiz-explanation">{question.explanation}</p>}
            </div>
          ))}
        </div>
        <div className={answered ? "score-card ready" : "score-card"}>
          <strong>{answered ? `${score}/100` : "Answer all questions"}</strong>
          <span>{answered ? (passed ? "Passing score reached" : "Score too low. Review the module first.") : "Passing score requires 60 or above."}</span>
        </div>
        <div className="action-row">
          <button className="btn btn-lime" onClick={() => completeQuest(disease, score, language)} disabled={busy === "quest" || !answered || !passed || completedMap[disease.id]} type="button">
            {busy === "quest" ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            {completedMap[disease.id] ? "Quest Completed" : "Complete Quest"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => claimBadge(disease.id)}
            disabled={busy === "badge" || badgeMap[disease.id] || !canBadgeMap[disease.id]}
            type="button"
          >
            <BadgeCheck size={18} />
            {badgeMap[disease.id] ? "Badge Claimed" : completedMap[disease.id] ? "Claim Badge" : "Complete first"}
          </button>
        </div>
      </section>
    </AppPage>
  );
}

function ClassifierPage({
  profile,
  navigate,
  classifierKind,
  setClassifierKind,
  bp,
  setBp,
  sugar,
  setSugar,
  bmi,
  setBmi,
  classifierResult,
}: RenderProps) {
  const [language, setLanguage] = useState(profile.preferredLanguage || 0);
  const copy = getClassifierCopy(language);
  const education = classifierResult ? getClassifierEducation(classifierKind, classifierResult, { bp, sugar, bmi }, language) : null;

  return (
    <AppPage title="Constual Classifier" kicker={copy.kicker}>
      <section className="classifier-layout">
        <div className="card classifier-card">
          <div className="classifier-intro">
            <ClassifierVisual kind={classifierKind} tone="neutral" />
            <div>
              <h2>{copy.introTitle}</h2>
              <p>{copy.introCopy}</p>
            </div>
          </div>
          <div className="classifier-topline">
            <div className="language-toggle">
              <Languages size={18} />
              <button className={language === 0 ? "active" : ""} onClick={() => setLanguage(0)} type="button">Indonesia</button>
              <button className={language === 1 ? "active" : ""} onClick={() => setLanguage(1)} type="button">English</button>
            </div>
            <span>{copy.frontendOnly}</span>
          </div>
          <div className="segmented">
            <button className={classifierKind === "bp" ? "active" : ""} onClick={() => setClassifierKind("bp")} type="button">{copy.bp}</button>
            <button className={classifierKind === "sugar" ? "active" : ""} onClick={() => setClassifierKind("sugar")} type="button">{copy.sugar}</button>
            <button className={classifierKind === "bmi" ? "active" : ""} onClick={() => setClassifierKind("bmi")} type="button">BMI</button>
          </div>

          {classifierKind === "bp" && (
            <div className="form-grid">
              <Field label={copy.systolic} value={bp.systolic} onChange={(value) => setBp({ ...bp, systolic: value })} type="number" />
              <Field label={copy.diastolic} value={bp.diastolic} onChange={(value) => setBp({ ...bp, diastolic: value })} type="number" />
            </div>
          )}
          {classifierKind === "sugar" && (
            <div className="form-grid">
              <Field label={copy.sugarValue} value={sugar.value} onChange={(value) => setSugar({ ...sugar, value })} type="number" />
              <label className="field">
                <span>{copy.readingType}</span>
                <select value={sugar.mode} onChange={(event) => setSugar({ ...sugar, mode: event.target.value })}>
                  <option value="fasting">{copy.fasting}</option>
                  <option value="random">{copy.random}</option>
                </select>
              </label>
            </div>
          )}
          {classifierKind === "bmi" && (
            <div className="form-grid">
              <Field label={copy.height} value={bmi.height} onChange={(value) => setBmi({ ...bmi, height: value })} type="number" />
              <Field label={copy.weight} value={bmi.weight} onChange={(value) => setBmi({ ...bmi, weight: value })} type="number" />
            </div>
          )}

          <p className="classifier-note">{copy.disclaimer}</p>
        </div>

        <motion.div className={`card classifier-result-card ${education?.tone ?? "neutral"}`} key={`${classifierKind}-${classifierResult?.category ?? "empty"}-${language}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          {education ? (
            <>
              <div className="result-hero">
                <ClassifierVisual kind={classifierKind} tone={education.tone} />
                <div>
                  <p className="eyebrow">{education.valueSummary}</p>
                  <h2>{education.category}</h2>
                  <p>{education.explanation}</p>
                </div>
              </div>
              <div className="education-grid">
                <EducationTile title={copy.meaning} copy={education.meaning} icon={BookOpen} />
                <EducationTile title={copy.food} copy={education.food} icon={Leaf} />
                <EducationTile title={copy.lifestyle} copy={education.lifestyle} icon={Heart} />
                <EducationTile title={copy.activity} copy={education.activity} icon={Activity} />
              </div>
              <div className="recommended-module">
                <div>
                  <strong>{copy.recommended}</strong>
                  <span>{education.moduleLabel}</span>
                </div>
                <button className="btn btn-lime" onClick={() => navigate(education.modulePath)} type="button">
                  {copy.openModule}
                  <ChevronRight size={17} />
                </button>
              </div>
              <div className="safety-mini">
                <ShieldCheck size={20} />
                <p>{education.safety}</p>
              </div>
            </>
          ) : (
            <div className="result-empty">
              <ClassifierVisual kind={classifierKind} tone="neutral" />
              <h2>{copy.empty}</h2>
              <p>{copy.disclaimer}</p>
            </div>
          )}
        </motion.div>
      </section>
    </AppPage>
  );
}

function AgentPage({
  selectedAgentScenario,
  agentLanguage,
  setAgentLanguage,
  agentReady,
  generateAgent,
  recordAgentGuide,
  busy,
  navigate,
}: RenderProps) {
  const answer = agentLanguage === 0 ? selectedAgentScenario.report.id : selectedAgentScenario.report.en;
  return (
    <AppPage title="Constual Agent" kicker="Simulated bilingual health guidance">
      <section className="card agent-hero-card">
        <div>
          <p className="eyebrow">Frontend-only preset assistant</p>
          <h2>A calm guide for learning, not diagnosis.</h2>
          <p>
            Pick a preset question, watch the simulated typing state, then switch the same answer between Indonesia and
            English without calling an API.
          </p>
        </div>
        <AgentVisual />
      </section>
      <section className="agent-layout">
        <aside className="card scenario-list">
          <div className="scenario-heading">
            <span>Preset questions</span>
            <strong>{agentScenarios.length} topics</strong>
          </div>
          {agentScenarios.map((scenario) => (
            <button className={scenario.id === selectedAgentScenario.id ? "active" : ""} key={scenario.id} onClick={() => generateAgent(scenario)} type="button">
              <span>{scenario.id}</span>
              {scenario.title}
            </button>
          ))}
        </aside>
        <div className="card chat-panel">
          <div className="chat-toolbar">
            <div>
              <span>Constual Agent</span>
              <strong>{selectedAgentScenario.title}</strong>
            </div>
            <div className="language-toggle">
              <Languages size={18} />
              <button className={agentLanguage === 0 ? "active" : ""} onClick={() => setAgentLanguage(0)} type="button">Indonesia</button>
              <button className={agentLanguage === 1 ? "active" : ""} onClick={() => setAgentLanguage(1)} type="button">English</button>
            </div>
          </div>
          <div className="user-bubble">{agentLanguage === 0 ? selectedAgentScenario.user.id : selectedAgentScenario.user.en}</div>
          {!agentReady ? (
            <div className="typing-card">
              <WellnessCharacter tone="lime" small />
              <div className="typing"><span /><span /><span /> Constual Agent is typing</div>
            </div>
          ) : (
            <motion.div className="agent-report" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <ReportLine label={agentLanguage === 0 ? "Penjelasan" : "Explanation"} value={answer.explanation} />
              <ReportLine label={agentLanguage === 0 ? "Makna belajar" : "Learning meaning"} value={answer.meaning} />
              <ReportLine label={agentLanguage === 0 ? "Panduan makanan" : "Food guidance"} value={answer.food} />
              <ReportLine label={agentLanguage === 0 ? "Panduan gaya hidup" : "Lifestyle guidance"} value={answer.lifestyle} />
              <ReportLine label={agentLanguage === 0 ? "Pengingat keselamatan" : "Safety reminder"} value={answer.safety} />
            </motion.div>
          )}
          <div className="agent-footer">
            <div>
              <strong>{agentLanguage === 0 ? "Rekomendasi modul" : "Recommended module"}</strong>
              <div className="module-buttons">
                {selectedAgentScenario.diseaseIds.length ? (
                  selectedAgentScenario.diseaseIds.map((id) => {
                    const disease = diseases.find((item) => item.id === id);
                    return disease ? (
                      <button key={id} onClick={() => navigate(`/disease/${slugForDisease(disease)}`)} type="button">
                        {agentLanguage === 0 ? disease.localName : disease.name}
                      </button>
                    ) : null;
                  })
                ) : (
                  <button onClick={() => navigate("/classifier")} type="button">Open Constual Classifier</button>
                )}
              </div>
            </div>
            <button className="btn btn-secondary" disabled={!agentReady || busy === "agent"} onClick={recordAgentGuide} type="button">
              {busy === "agent" ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
              Record Agent Guide Proof
            </button>
          </div>
        </div>
      </section>
    </AppPage>
  );
}

function PassportPage({
  account,
  profile,
  profileCreated,
  profileForm,
  setProfileForm,
  profileError,
  loadProfile,
  submitProfile,
  busy,
  completedDiseaseIds,
  badgeMap,
  connectWallet,
}: RenderProps) {
  return (
    <AppPage title="Constual Passport" kicker="Privacy-safe learning identity">
      {profileError && (
        <div className="read-error">
          <span>{profileError}</span>
          <button className="btn btn-secondary" onClick={loadProfile} type="button">Retry reads</button>
        </div>
      )}
      <section className="passport-layout">
        <div className="card passport-profile">
          <Avatar profile={profileCreated ? profile : profileForm} />
          <div>
            <p className="eyebrow">{profileCreated ? "Passport active" : "Create passport"}</p>
            <h2>{profileCreated ? profile.displayName : "Create your Constual Passport"}</h2>
            <p>@{profileCreated ? profile.constualUsername : "constual_username"}</p>
            <p>{profileCreated && profile.xUsername ? `X: @${profile.xUsername}` : "X avatar syncs after profile save"}</p>
            <p>{account ? shortAddress(account) : "Wallet not connected"}</p>
          </div>
        </div>

        <div className="stats-grid compact">
          <Stat label="XP" value={formatBigint(profile.xp)} />
          <Stat label="Completed quests" value={formatBigint(profile.completedCount)} />
          <Stat label="Badge count" value={formatBigint(profile.badgeCount)} />
          <Stat label="Streak" value={formatBigint(profile.streak)} />
          <Stat label="Quiz count" value={formatBigint(profile.quizCount)} />
          <Stat label="Classifier use" value={formatBigint(profile.classifierUseCount)} />
          <Stat label="Agent guide" value={formatBigint(profile.agentGuideCount)} />
          <Stat label="Language" value={languageLabels[profile.preferredLanguage] ?? "Indonesia"} />
        </div>

        <div className="card passport-form">
          <div className="form-grid">
            <Field label="Display Name" value={profileForm.displayName} onChange={(value) => setProfileForm({ ...profileForm, displayName: value })} />
            <Field
              label="Constual Username"
              value={profileForm.constualUsername}
              onChange={(value) => setProfileForm({ ...profileForm, constualUsername: value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
            />
            <Field
              label="X Username without @"
              value={profileForm.xUsername}
              onChange={(value) => setProfileForm({ ...profileForm, xUsername: value.replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "") })}
            />
            <label className="field">
              <span>Preferred Language</span>
              <select value={profileForm.preferredLanguage} onChange={(event) => setProfileForm({ ...profileForm, preferredLanguage: Number(event.target.value) })}>
                <option value={0}>Indonesia</option>
                <option value={1}>English</option>
              </select>
            </label>
          </div>
          <div className="action-row">
            <button className="btn btn-lime" onClick={account ? submitProfile : connectWallet} disabled={busy === "profile"} type="button">
              {busy === "profile" ? <Loader2 className="spin" size={18} /> : <BadgeCheck size={18} />}
              {account ? (profileCreated ? "Update Passport" : "Create Passport") : "Connect Wallet"}
            </button>
            <button className="btn btn-secondary" onClick={loadProfile} disabled={!account} type="button">Refetch Passport</button>
          </div>
          <p className="privacy">{privacyCopy}</p>
        </div>

        <div className="card badge-grid-card">
          <h3>Completed disease list</h3>
          <div className="badge-grid">
            {diseases.map((disease) => (
              <div className={completedDiseaseIds.includes(disease.id) ? "badge-tile complete" : "badge-tile"} key={disease.id}>
                <disease.icon size={18} />
                <span>{disease.name}</span>
                <small>{badgeMap[disease.id] ? "Badge claimed" : completedDiseaseIds.includes(disease.id) ? "Quest complete" : "Not completed"}</small>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppPage>
  );
}

function LeaderboardPage({ leaderboard, leaderboardError, loadLeaderboard }: RenderProps) {
  return (
    <AppPage title="Leaderboard" kicker="Sorted by XP from Ritual reads" action={<button className="btn btn-secondary" onClick={loadLeaderboard} type="button">Refresh</button>}>
      {leaderboardError && <div className="read-error">{leaderboardError}</div>}
      <div className="leaderboard-list">
        {leaderboard.map((row, index) => (
          <div className="card leader-row" key={row.address}>
            <span className="rank">{index + 1}</span>
            <Avatar profile={row} small />
            <div>
              <strong>{row.displayName || shortAddress(row.address)}</strong>
              <p>@{row.constualUsername || "constual"} - {shortAddress(row.address)}</p>
            </div>
            <div className="leader-score">
              <strong>{formatBigint(row.xp)} XP</strong>
              <small>{formatBigint(row.accuracy)} accuracy</small>
            </div>
          </div>
        ))}
        {!leaderboard.length && (
          <div className="empty-state card">
            <WellnessCharacter tone="pink" />
            <h3>No leaderboard rows yet</h3>
            <p>Create a Constual Passport and complete quests to appear here.</p>
          </div>
        )}
      </div>
    </AppPage>
  );
}

function AboutPage({ navigate }: { navigate: (path: string) => void }) {
  const futureItems = [
    "More disease modules",
    "Better interactive learning",
    "Richer agent guidance",
    "Future Ritual-native AI exploration",
    "Community health education campaigns",
  ];

  return (
    <AppPage title="About Constual" kicker="Caring, modern, trusted, calm">
      <section className="about-story">
        <motion.div className="card about-hero-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div>
            <p className="eyebrow">Caring, Modern, Trusted, Calm</p>
            <h2>Health learning with privacy-safe proof.</h2>
            <p>
              A bilingual health education dApp on Ritual Testnet designed to make common health learning simple,
              visual, and privacy-safe.
            </p>
          </div>
          <div className="about-orbit">
            <AboutVisual />
          </div>
        </motion.div>

        <div className="about-grid extended">
          <AboutCard
            title="What is Constual?"
            copy="Constual helps users learn common health topics, use education-focused classifiers, ask a simulated bilingual health guidance agent, complete quizzes, and build privacy-safe proof-of-learning."
            icon={Leaf}
          />
          <AboutCard
            title="Why Constual?"
            copy="Many people misunderstand blood pressure, blood sugar, BMI, common cold, dengue, and lifestyle basics. Constual turns these topics into simple bilingual visual learning."
            icon={Heart}
          />
          <AboutCard
            title="Built on Ritual Testnet"
            copy="Constual uses Ritual Testnet for passport, badges, leaderboard, and learning proof as a real-world health literacy experiment."
            icon={ShieldCheck}
          />
          <div className="card about-copy">
            <BadgeCheck size={28} />
            <h2>Feature system</h2>
            <div className="about-feature-list">
              {[
                ["Constual Passport", "Learning identity, XP, badges, X avatar."],
                ["Disease Library", "Bilingual modules before quizzes."],
                ["Classifier", "Frontend-only education for BP, sugar, and BMI."],
                ["Agent", "Simulated bilingual preset guidance."],
                ["Quiz & Badge", "Proof-of-learning after passing modules."],
                ["Leaderboard", "Ritual Testnet progress sorted by XP."],
                ["Proof of Learning", "Learning progress without medical records."],
              ].map(([title, copy]) => (
                <span key={title}><strong>{title}</strong>{copy}</span>
              ))}
            </div>
          </div>
        </div>

        <section className="card future-card visual-future">
          <div>
            <p className="eyebrow">Future Direction</p>
            <h2>More visual, more useful, still privacy-safe.</h2>
            <p>V1 has no LLM precompile, no backend, and no AI API. The next direction is richer health literacy, not medical records.</p>
          </div>
          <div className="future-timeline">
            {futureItems.map((item, index) => (
              <motion.div key={item} initial={{ opacity: 0, x: 18 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.05 }}>
                <span>{index + 1}</span>
                <strong>{item}</strong>
              </motion.div>
            ))}
          </div>
        </section>

        <div className="about-grid extended">
          <div className="card about-copy">
            <ShieldCheck size={28} />
            <h2>Privacy-safe design</h2>
            <p>
              Constual does not store raw blood pressure, blood sugar, height, weight, symptoms, diagnosis, medication,
              or medical history onchain. It stores learning proof, XP, badge progress, and privacy-safe activity only.
            </p>
          </div>
          <div className="card about-copy">
            <X size={28} />
            <h2>What Constual is NOT</h2>
            <div className="not-grid">
              {["Not diagnosis", "Not doctor consultation", "Not a medical record app", "Not a personal diet plan", "Not emergency advice"].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
          <div className="card about-copy people-section">
            <UserRound size={28} />
            <h2>Builder & Contributor</h2>
            <div className="people-grid">
              <PersonCard
                role="Builder"
                name="Nxrskyaa"
                xUsername="nxrskyaa"
                github="https://github.com/nxrskyaa"
                xUrl="https://x.com/nxrskyaa"
                copy="Indonesia-based Web3 content creator and builder exploring real-world blockchain applications for health literacy, education, and AI-assisted learning."
              />
              <PersonCard
                role="Contributor"
                name="Rikky Dwiyanto"
                xUsername="rikkydwiyanto"
                xUrl="https://x.com/rikkydwiyanto"
                copy="Contributor supporting Constual's health education direction, product polish, and community-ready learning experience."
              />
            </div>
          </div>
          <div className="card about-copy safety-card">
            <Heart size={28} />
            <h2>Safety</h2>
            <p>{safetyCopy}</p>
            <button className="btn btn-dark" onClick={() => navigate("/library")} type="button">Start Learning</button>
          </div>
        </div>
      </section>
    </AppPage>
  );
}

function AboutCard({ title, copy, icon: Icon }: { title: string; copy: string; icon: LucideIcon }) {
  return (
    <motion.div className="card about-copy" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
      <Icon size={28} />
      <h2>{title}</h2>
      <p>{copy}</p>
    </motion.div>
  );
}

function PersonCard({
  role,
  name,
  xUsername,
  github,
  xUrl,
  copy,
}: {
  role: string;
  name: string;
  xUsername: string;
  github?: string;
  xUrl: string;
  copy: string;
}) {
  const [failed, setFailed] = useState(false);
  const avatar = failed
    ? `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`
    : `https://unavatar.io/x/${encodeURIComponent(xUsername)}`;

  return (
    <div className="person-card">
      <img src={avatar} alt={`${name} avatar`} onError={() => setFailed(true)} />
      <div>
        <span>{role}</span>
        <h3>{name}</h3>
        <p>@{xUsername}</p>
      </div>
      <p>{copy}</p>
      <div className="person-links">
        {github && <a href={github} rel="noreferrer" target="_blank">GitHub</a>}
        <a href={xUrl} rel="noreferrer" target="_blank">X</a>
      </div>
    </div>
  );
}

function Navbar({
  route,
  navigate,
  account,
  connectWallet,
  wrongNetwork,
  switchNetwork,
  disconnectWallet,
  mobileMenuOpen,
  setMobileMenuOpen,
  profile,
}: {
  route: RouteInfo;
  navigate: (path: string) => void;
  account: Address | null;
  connectWallet: () => void;
  wrongNetwork: boolean;
  switchNetwork: () => void;
  disconnectWallet: () => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  profile: Profile;
}) {
  const [walletOpen, setWalletOpen] = useState(false);
  const landing = route.name === "landing";
  const links = landing
    ? [
        { label: "Features", path: "#features" },
        { label: "Safety", path: "#safety" },
      ]
    : appLinks;

  const handleLink = (path: string) => {
    if (path.startsWith("#")) {
      document.querySelector(path)?.scrollIntoView({ behavior: "smooth" });
      setMobileMenuOpen(false);
      return;
    }
    navigate(path);
  };

  const copyAddress = async () => {
    if (!account) return;
    await navigator.clipboard?.writeText(account);
    setWalletOpen(false);
  };

  const openExplorer = () => {
    if (!account) return;
    window.open(`https://explorer.ritualfoundation.org/address/${account}`, "_blank", "noopener,noreferrer");
    setWalletOpen(false);
  };

  const handleDisconnect = () => {
    disconnectWallet();
    setWalletOpen(false);
    setMobileMenuOpen(false);
  };

  return (
    <header className="navbar-wrap">
      <nav className="navbar">
        <button className="logo-button" onClick={() => navigate("/")} type="button" aria-label="Constual home">
          <ConstualLogo />
        </button>

        <div className="nav-pill desktop-nav">
          {links.map((link) => (
            <button
              className={!landing && "path" in link && isActiveRoute(route, link.path) ? "active" : ""}
              key={link.label}
              onClick={() => handleLink(link.path)}
              type="button"
            >
              {link.label}
            </button>
          ))}
        </div>

        <div className="nav-actions">
          <ThemeToggle />
          {!landing && wrongNetwork && (
            <button className="btn btn-warning wallet-switch" onClick={switchNetwork} type="button">
              <Network size={16} />
              Switch to Ritual
            </button>
          )}
          {!landing && (
            <div className="wallet-shell">
              {!account ? (
                <button className="wallet-connect" onClick={connectWallet} type="button">
                  <Wallet size={17} />
                  Connect Wallet
                </button>
              ) : (
                <button className="wallet-pill" onClick={() => setWalletOpen((open) => !open)} type="button" aria-expanded={walletOpen}>
                  <span className="wallet-dot" />
                  <span className="wallet-main">{shortAddress(account)}</span>
                  <span className="wallet-network">Ritual</span>
                  <ChevronDown size={16} />
                </button>
              )}
              {account && walletOpen && (
                <motion.div className="wallet-menu" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
                  <div className="wallet-menu-head">
                    <span>Connected wallet</span>
                    <strong>{shortAddress(account)}</strong>
                  </div>
                  <button onClick={copyAddress} type="button"><Copy size={16} /> Copy address</button>
                  <button onClick={openExplorer} type="button"><ExternalLink size={16} /> View on Explorer</button>
                  <button className="danger" onClick={handleDisconnect} type="button"><X size={16} /> Disconnect</button>
                </motion.div>
              )}
            </div>
          )}
          {landing && (
            <button className="btn btn-lime desktop-cta" onClick={() => navigate("/app")} type="button">Enter Constual</button>
          )}
          <button className="hamburger" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} type="button" aria-label="Open menu">
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <motion.div className="mobile-menu" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          {links.map((link) => (
            <button key={link.label} onClick={() => handleLink(link.path)} type="button">{link.label}</button>
          ))}
          {!landing && (
            <>
              {!account ? (
                <button onClick={connectWallet} type="button">Connect Wallet</button>
              ) : (
                <>
                  <button onClick={copyAddress} type="button">{profile.constualUsername || shortAddress(account)}</button>
                  <button onClick={handleDisconnect} type="button">Disconnect</button>
                </>
              )}
            </>
          )}
        </motion.div>
      )}
    </header>
  );
}

function MobileBottomNav({ route, navigate }: { route: RouteInfo; navigate: (path: string) => void }) {
  const links = appLinks.slice(0, 5);
  return (
    <nav className="bottom-nav">
      {links.map((link) => (
        <button className={isActiveRoute(route, link.path) ? "active" : ""} key={link.path} onClick={() => navigate(link.path)} type="button">
          <link.icon size={18} />
          <span>{link.label}</span>
        </button>
      ))}
    </nav>
  );
}

function AppPage({ title, kicker, action, children }: { title: string; kicker: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="app-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{kicker}</p>
          <h1>{title}</h1>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function LandingSection({ id, title, copy, children }: { id?: string; title: string; copy: string; children: ReactNode }) {
  return (
    <motion.section className="landing-section" id={id} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-90px" }} transition={{ duration: 0.55 }}>
      <div className="section-heading">
        <p className="eyebrow">Constual</p>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      {children}
    </motion.section>
  );
}

function FeatureGrid({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="feature-grid">
      {featureCards.map((feature, index) => (
        <motion.button className="card feature-card" key={feature.title} onClick={() => navigate(feature.path)} type="button" initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} whileHover={{ y: -5 }} whileTap={{ scale: 0.985 }} viewport={{ once: true, margin: "-80px" }} transition={{ delay: index * 0.045 }}>
          <WellnessCharacter tone={feature.buddy as CharacterTone} small />
          <feature.icon size={23} />
          <h3>{feature.title}</h3>
          <p>{feature.copy}</p>
        </motion.button>
      ))}
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark",
  );
  const toggle = () => {
    const next = !dark;
    setDark(next);
    const root = document.documentElement;
    if (next) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    try {
      localStorage.setItem("constual-theme", next ? "dark" : "light");
    } catch {
      /* ignore storage errors */
    }
  };
  return (
    <button className="theme-toggle" onClick={toggle} type="button" aria-label="Toggle dark mode" title={dark ? "Switch to light mode" : "Switch to dark mode"}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function NetworkGate({ switchNetwork }: { switchNetwork: () => void }) {
  return (
    <div className="network-gate">
      <ShieldCheck />
      <div>
        <strong>Please switch to Ritual Testnet.</strong>
        <span>Write transactions are disabled until your wallet is on chain ID 1979.</span>
      </div>
      <button className="btn btn-lime" onClick={switchNetwork} type="button">Switch to Ritual Testnet</button>
    </div>
  );
}

function HeroBuddyGroup({ compact = false }: { compact?: boolean }) {
  return (
    <motion.div className={compact ? "hero-visual compact" : "hero-visual"} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18 }}>
      <div className="lime-glow" />
      <div className="phone-mock">
        <div className="mock-top">
          <ConstualMark />
          <span>Learning Score</span>
          <strong>85</strong>
        </div>
        <div className="mock-line wide" />
        <div className="mock-line" />
        <div className="mock-cards">
          <FloatingHealthCard label="Passport" />
          <FloatingHealthCard label="Classifier" />
          <FloatingHealthCard label="Agent" />
        </div>
      </div>
      <WellnessCharacter tone="lime" className="buddy b1" />
      <WellnessCharacter tone="blue" className="buddy b2" />
      <WellnessCharacter tone="orange" className="buddy b3" />
      <FloatingHealthCard label="Learning Badge" className="float-card f1" />
      <FloatingHealthCard label="Ritual Proof" className="float-card f2" />
    </motion.div>
  );
}

function AboutVisual() {
  return (
    <div className="about-visual">
      <div className="about-visual-card passport">
        <ConstualMark />
        <span>Learning Passport</span>
        <strong>Privacy-safe progress</strong>
      </div>
      <div className="about-visual-card badge">
        <BadgeCheck size={24} />
        <span>Badge proof</span>
        <strong>Ritual Testnet</strong>
      </div>
      <div className="about-visual-card proof">
        <ShieldCheck size={24} />
        <span>No medical records</span>
        <strong>Learning only</strong>
      </div>
      <WellnessCharacter tone="lime" className="about-buddy a1" />
      <WellnessCharacter tone="blue" className="about-buddy a2" />
      <WellnessCharacter tone="pink" className="about-buddy a3" />
    </div>
  );
}

function HeroMiniMockup() {
  return (
    <div className="mini-mock">
      <WellnessCharacter tone="lime" />
      <FloatingHealthCard label="Passport" />
      <FloatingHealthCard label="Ritual Proof" />
    </div>
  );
}

function AgentVisual() {
  return (
    <div className="agent-visual">
      <WellnessCharacter tone="lime" />
      <div className="agent-orbit-card food">Food guidance</div>
      <div className="agent-orbit-card life">Lifestyle</div>
      <div className="agent-orbit-card safe">Safety first</div>
    </div>
  );
}

type CharacterTone = "lime" | "blue" | "orange" | "purple" | "pink";

function WellnessCharacter({ tone, small = false, className = "" }: { tone: CharacterTone; small?: boolean; className?: string }) {
  return (
    <div className={`wellness-character ${tone} ${small ? "small" : ""} ${className}`} aria-hidden="true">
      <div className="shine" />
      <div className="eyes">
        <i />
        <i />
      </div>
      <div className="smile" />
      <div className="leaflet" />
    </div>
  );
}

function DiseaseVisual({ diseaseId, compact = false }: { diseaseId: number; compact?: boolean }) {
  const tone = (["lime", "blue", "orange", "purple", "pink"][(diseaseId - 1) % 5] ?? "lime") as CharacterTone;
  const Icon = diseases.find((disease) => disease.id === diseaseId)?.icon ?? Leaf;
  return (
    <div className={compact ? "disease-visual compact" : "disease-visual"}>
      <WellnessCharacter tone={tone} small={compact} />
      <div className="disease-icon-orbit">
        <Icon size={24} />
      </div>
    </div>
  );
}

function Web3IssueVisual({ tone, index }: { tone: CharacterTone; index: number }) {
  const labels = ["Sleep", "Eyes", "Posture", "Stress", "Burnout", "Move", "Coffee", "Meals", "Social", "Info"];
  return (
    <div className={`web3-issue-visual ${tone}`}>
      <WellnessCharacter tone={tone} small />
      <span>{labels[index] ?? "Web3"}</span>
      <div className="web3-visual-bars"><i /><i /><i /></div>
    </div>
  );
}

function FloatingHealthCard({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`floating-health-card ${className}`}>
      <span className="chip-dot" />
      <span>{label}</span>
    </div>
  );
}

function ConstualLogo() {
  return (
    <span className="constual-logo">
      <ConstualMark />
      <span>Constual</span>
    </span>
  );
}

function ConstualMark() {
  return (
    <svg className="constual-mark" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M13 31c1-14 10-23 22-25 6-1 12 1 16 6" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path d="M12 34c14 0 23 7 26 20-13 0-23-7-26-20Z" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      <path d="M35 54c2-15 9-24 24-26 0 15-9 24-24 26Z" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="31" cy="22" r="5" fill="currentColor" />
    </svg>
  );
}

function Avatar({ profile, small = false }: { profile: Pick<Profile, "displayName" | "constualUsername" | "xUsername"> | ProfileForm; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const cleanX = stripX(profile.xUsername);
  const seed = encodeURIComponent(profile.constualUsername || profile.displayName || "Constual");
  const src = cleanX && !failed ? `https://unavatar.io/x/${encodeURIComponent(cleanX)}` : `https://api.dicebear.com/9.x/initials/svg?seed=${seed}`;

  useEffect(() => setFailed(false), [cleanX, seed]);

  return <img className={small ? "avatar small" : "avatar"} src={src} alt="Constual Passport avatar" onError={() => setFailed(true)} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} type={type} />
    </label>
  );
}

function InfoPill({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="info-pill">
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function ReportLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <strong>{label}</strong>
      <p>{value}</p>
    </div>
  );
}

function parseRoute(pathname: string): RouteInfo {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return { name: "landing" };
  if (path === "/app") return { name: "app" };
  if (path === "/play") return { name: "play" };
  if (path === "/library") return { name: "library" };
  if (path === "/classifier") return { name: "classifier" };
  if (path === "/agent") return { name: "agent" };
  if (path === "/passport") return { name: "passport" };
  if (path === "/leaderboard") return { name: "leaderboard" };
  if (path === "/about") return { name: "about" };
  const web3Health = path.match(/^\/web3-health-issues\/([^/]+)$/);
  if (web3Health) return { name: "web3Health", slug: web3Health[1] };
  const quiz = path.match(/^\/disease\/([^/]+)\/quiz$/);
  if (quiz) return { name: "quiz", slug: quiz[1] };
  const disease = path.match(/^\/disease\/([^/]+)$/);
  if (disease) return { name: "disease", slug: disease[1] };
  return { name: "app" };
}

function isActiveRoute(route: RouteInfo, path: string) {
  if (path === "/app") return route.name === "app";
  if (path === "/library") return route.name === "library" || route.name === "disease" || route.name === "quiz" || route.name === "web3Health";
  return parseRoute(path).name === route.name;
}

function slugForDisease(disease: Disease) {
  return disease.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function diseaseBySlug(slug: string) {
  return diseases.find((disease) => slugForDisease(disease) === slug) ?? diseases[0];
}

function web3IssueBySlug(slug: string) {
  return web3Issues.find((issue) => issue.slug === slug) ?? web3Issues[0];
}

function createWeb3Issue(slug: string, titleId: string, titleEn: string, tone: CharacterTone, sections: [string, string, string, string][]): Web3Issue {
  return {
    slug,
    title: { id: titleId, en: titleEn },
    intro: {
      id: `${titleId} adalah isu kesehatan yang sering muncul di komunitas Web3 karena ritme kerja digital yang panjang, lintas zona waktu, dan selalu aktif.`,
      en: `${titleEn} is a health issue that often appears in Web3 communities because digital work can be long, cross-time-zone, and always active.`,
    },
    readTime: "5-7 min",
    tone,
    sections: sections.map(([labelId, labelEn, copyId, copyEn]) => ({
      label: { id: labelId, en: labelEn },
      title: { id: labelId, en: labelEn },
      copy: { id: copyId, en: copyEn },
    })),
  };
}

type LearningCard = {
  label: string;
  title: string;
  copy: string;
};

type QuizCard = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

function getLearningSections(diseaseId: number, language: number): LearningCard[] {
  const disease = diseases.find((item) => item.id === diseaseId) ?? diseases[0];
  if (diseaseId === 1) {
    return commonColdSections.map((section) => ({
      label: language === 0 ? section.label.id : section.label.en,
      title: language === 0 ? section.title.id : section.title.en,
      copy: language === 0 ? section.copy.id : section.copy.en,
    }));
  }
  const enBase = [
    ["Definition", `${disease.name} basics`, disease.summary],
    ["Why it matters", "Health literacy context", `${disease.name} education helps users understand common warning signs, prevention ideas, and when professional care matters without turning the app into diagnosis.`],
    ["Causes", "Common causes and mechanisms", "This topic can involve infection, lifestyle, environment, genetics, or body-system changes depending on the disease. Learning the cause helps users avoid unsafe assumptions."],
    ["Risk Factors", "What can increase risk", "Age, environment, daily habits, family history, exposure patterns, nutrition, sleep, and existing conditions can change risk depending on the topic."],
    ["Symptoms", "Signs to notice", "Symptoms are learning signals. They help users pay attention, but they are not enough for diagnosis without qualified assessment."],
    ["Diagnosis basics", "How clinicians confirm", "Health workers combine history, examination, and appropriate tests rather than relying on one number, one symptom, or one online answer."],
    ["Management basics", "Care is personal", "Treatment decisions belong with qualified professionals. Constual explains safe concepts, supportive habits, and questions users can bring to care."],
    ["Food and daily habits", "Everyday support", "Balanced meals, hydration, sleep, movement, hygiene, and avoiding harmful habits can support general health while users seek proper guidance when needed."],
    ["Prevention", "Small habits help", "Prevention usually combines hygiene, sleep, movement, nutrition, environmental control, screening, and early care where relevant."],
    ["Red flags", "Know when care is urgent", "Severe, sudden, persistent, or worsening symptoms should be checked promptly, especially breathing trouble, bleeding, confusion, fainting, chest pain, or severe dehydration."],
    ["Common myths", "Avoid unsafe shortcuts", "Do not use antibiotics, supplements, extreme diets, or medication changes without proper indication and professional guidance."],
    ["Summary", "Ready for quiz", "Review the key ideas, then take the quiz to record privacy-safe proof-of-learning."],
  ];
  const idBase = [
    ["Pengertian", `Dasar ${disease.localName}`, disease.lesson],
    ["Mengapa penting", "Konteks literasi kesehatan", `Edukasi ${disease.localName} membantu pengguna memahami tanda umum, ide pencegahan, dan kapan perlu bantuan profesional tanpa menjadikan aplikasi sebagai alat diagnosis.`],
    ["Penyebab", "Penyebab dan mekanisme umum", "Topik kesehatan dapat berkaitan dengan infeksi, gaya hidup, lingkungan, genetik, atau perubahan sistem tubuh. Memahami penyebab membantu pengguna menghindari asumsi yang tidak aman."],
    ["Faktor Risiko", "Hal yang meningkatkan risiko", "Usia, lingkungan, kebiasaan harian, riwayat keluarga, pola paparan, nutrisi, tidur, dan kondisi yang sudah ada dapat memengaruhi risiko sesuai topik."],
    ["Gejala", "Tanda yang perlu diamati", "Gejala adalah sinyal pembelajaran. Gejala membantu pengguna memperhatikan tubuh, tetapi bukan dasar diagnosis tanpa pemeriksaan tenaga kesehatan."],
    ["Dasar Diagnosis", "Cara tenaga kesehatan memastikan", "Tenaga kesehatan menggabungkan riwayat, pemeriksaan, dan tes yang sesuai, bukan hanya satu angka, satu gejala, atau satu jawaban online."],
    ["Dasar Tata Laksana", "Perawatan bersifat personal", "Keputusan terapi harus bersama tenaga kesehatan. Constual menjelaskan konsep aman, kebiasaan pendukung, dan pertanyaan yang bisa dibawa saat konsultasi."],
    ["Makanan dan Kebiasaan", "Dukungan sehari-hari", "Makan seimbang, hidrasi, tidur, gerak, kebersihan, dan menghindari kebiasaan berbahaya dapat mendukung kesehatan umum sambil mencari arahan yang tepat bila perlu."],
    ["Pencegahan", "Kebiasaan kecil membantu", "Pencegahan biasanya menggabungkan kebersihan, tidur, gerak, nutrisi, kontrol lingkungan, skrining, dan pemeriksaan dini bila relevan."],
    ["Tanda Bahaya", "Kapan harus segera mencari bantuan", "Gejala berat, mendadak, menetap, atau memburuk perlu diperiksa segera, terutama sesak, perdarahan, bingung, pingsan, nyeri dada, atau dehidrasi berat."],
    ["Mitos Umum", "Hindari jalan pintas yang tidak aman", "Jangan menggunakan antibiotik, suplemen, diet ekstrem, atau mengubah obat tanpa indikasi yang tepat dan arahan profesional."],
    ["Ringkasan", "Siap kuis", "Tinjau ide utama, lalu ikuti kuis untuk mencatat bukti belajar yang aman secara privasi."],
  ];
  return (language === 0 ? idBase : enBase).map(([label, title, copy]) => ({ label, title, copy }));
}

function getQuizQuestions(diseaseId: number, language: number): QuizCard[] {
  const disease = diseases.find((item) => item.id === diseaseId) ?? diseases[0];
  if (diseaseId === 1) {
    if (language === 0) {
      return [
        {
          question: "Apa penyebab paling umum common cold?",
          options: ["Virus", "Bakteri yang selalu butuh antibiotik", "Kurang minum saja"],
          answer: 0,
          explanation: "Common cold paling sering disebabkan virus, sehingga antibiotik tidak digunakan untuk pilek biasa tanpa indikasi bakteri.",
        },
        {
          question: "Bagaimana common cold dapat menular?",
          options: ["Droplet, tangan, dan permukaan terkontaminasi", "Hanya dari makanan pedas", "Hanya karena udara dingin"],
          answer: 0,
          explanation: "Virus dapat berpindah lewat batuk/bersin, tangan, dan permukaan, terutama saat tangan menyentuh mata, hidung, atau mulut.",
        },
        {
          question: "Kapan seseorang perlu lebih waspada?",
          options: ["Sesak napas, demam tinggi menetap, nyeri dada, atau kondisi memburuk", "Bersin sekali", "Hidung meler ringan satu hari"],
          answer: 0,
          explanation: "Tanda berat atau memburuk perlu penilaian medis, bukan hanya perawatan mandiri.",
        },
        {
          question: "Apa langkah perawatan suportif yang aman?",
          options: ["Istirahat, cukup cairan, makan bergizi, dan obat sesuai aturan bila perlu", "Minum antibiotik sendiri", "Tetap memaksa begadang"],
          answer: 0,
          explanation: "Perawatan suportif membantu pemulihan. Obat harus digunakan sesuai aturan dan antibiotik tidak untuk pilek virus biasa.",
        },
      ];
    }

    return [
      {
        question: "What is the most common cause of the common cold?",
        options: ["Viruses", "Bacteria that always need antibiotics", "Only not drinking enough water"],
        answer: 0,
        explanation: "The common cold is most often viral, so antibiotics do not help typical colds without a bacterial indication.",
      },
      {
        question: "How can the common cold spread?",
        options: ["Droplets, hands, and contaminated surfaces", "Only from spicy food", "Only from cold air"],
        answer: 0,
        explanation: "Viruses can spread through coughs/sneezes, hands, and surfaces, especially when hands touch the eyes, nose, or mouth.",
      },
      {
        question: "When should someone be more cautious?",
        options: ["Breathlessness, persistent high fever, chest pain, or worsening condition", "One sneeze", "A mild runny nose for one day"],
        answer: 0,
        explanation: "Severe or worsening signs need medical assessment, not only self-care.",
      },
      {
        question: "What is a safe supportive care step?",
        options: ["Rest, fluids, nutritious meals, and medicine as directed when needed", "Self-start antibiotics", "Force yourself to stay up all night"],
        answer: 0,
        explanation: "Supportive care helps recovery. Medicines should be used as directed, and antibiotics are not for typical viral colds.",
      },
    ];
  }
  if (language === 0) {
    return [
      {
        question: `Apa tujuan utama modul ${disease.localName}?`,
        options: ["Memberi edukasi aman", "Memberi diagnosis pasti", "Mengganti dokter"],
        answer: 0,
        explanation: "Constual hanya untuk edukasi dan bukti belajar, bukan diagnosis.",
      },
      {
        question: "Apa yang harus dilakukan bila ada tanda bahaya?",
        options: ["Cari bantuan medis", "Tunggu bukti onchain", "Abaikan gejala"],
        answer: 0,
        explanation: "Tanda bahaya perlu penilaian medis, bukan hanya edukasi aplikasi.",
      },
      {
        question: "Apa yang disimpan Constual?",
        options: ["Progress belajar", "Rekam medis lengkap", "Nilai mentah kesehatan"],
        answer: 0,
        explanation: "Constual menyimpan progress/bukti belajar, bukan rekam medis.",
      },
    ];
  }

  return [
    {
      question: `What is the main purpose of the ${disease.name} module?`,
      options: ["Safe education", "Definitive diagnosis", "Replacing clinicians"],
      answer: 0,
      explanation: "Constual is for education and proof-of-learning, not diagnosis.",
    },
    {
      question: "What should you do when red flags appear?",
      options: ["Seek medical help", "Wait for onchain proof", "Ignore symptoms"],
      answer: 0,
      explanation: "Red flags need medical assessment, not only app-based education.",
    },
    {
      question: "What does Constual store?",
      options: ["Learning progress", "Full medical records", "Raw health values"],
      answer: 0,
      explanation: "Constual stores learning progress/proof, not medical records.",
    },
  ];
}

type ClassifierEducation = {
  tone: "normal" | "watch" | "alert" | "neutral";
  category: string;
  valueSummary: string;
  explanation: string;
  meaning: string;
  food: string;
  lifestyle: string;
  activity: string;
  safety: string;
  moduleLabel: string;
  modulePath: string;
};

function getClassifierEducation(
  kind: ClassifierKind,
  result: { category: string; label: string },
  values: { bp: { systolic: string; diastolic: string }; sugar: { value: string; mode: string }; bmi: { height: string; weight: string } },
  language: number,
): ClassifierEducation {
  const id = language === 0;
  const bpSummary = id ? `${values.bp.systolic}/${values.bp.diastolic} mmHg` : `${values.bp.systolic}/${values.bp.diastolic} mmHg`;
  const sugarSummary = `${values.sugar.value} mg/dL ${id ? values.sugar.mode === "fasting" ? "puasa" : "sewaktu" : values.sugar.mode}`;
  const heightM = Number(values.bmi.height) / 100;
  const bmiValue = heightM ? Number(values.bmi.weight) / (heightM * heightM) : 0;
  const bmiSummary = `BMI ${bmiValue.toFixed(1)} (${values.bmi.height} cm, ${values.bmi.weight} kg)`;

  const shared = {
    bpModule: id ? "Modul Hipertensi" : "Hypertension module",
    sugarModule: id ? "Modul Diabetes Tipe 2" : "Type 2 Diabetes module",
    libraryModule: id ? "Disease Library" : "Disease Library",
  };

  const entries: Record<string, ClassifierEducation> = {
    bp_normal: {
      tone: "normal",
      category: id ? "Rentang tekanan darah normal" : "Normal blood pressure range",
      valueSummary: bpSummary,
      explanation: id ? "Hasil ini berada dalam rentang yang umum dianggap normal untuk banyak orang dewasa." : "This result is within the usual adult range for many people.",
      meaning: id ? "Satu hasil normal cukup baik, tetapi pola pengukuran berkala memberi gambaran yang lebih aman." : "One normal reading is reassuring, while routine measurement gives safer context.",
      food: id ? "Pertahankan piring seimbang, buah, sayur, dan tidak berlebihan garam." : "Keep balanced meals, fruit, vegetables, and avoid excessive salt.",
      lifestyle: id ? "Tidur cukup, kelola stres, hindari rokok, dan pantau tensi secara wajar." : "Support sleep, stress care, tobacco avoidance, and reasonable monitoring.",
      activity: id ? "Jalan kaki rutin dan gerak ringan harian membantu menjaga kebugaran jantung." : "Regular walking and daily light movement can support heart fitness.",
      safety: id ? "Constual tidak memberi diagnosis. Diskusikan bila angka berubah atau ada keluhan." : "Constual does not diagnose. Discuss changes or symptoms with a professional.",
      moduleLabel: shared.bpModule,
      modulePath: "/disease/hypertension",
    },
    bp_elevated: {
      tone: "watch",
      category: id ? "Rentang tekanan darah meningkat" : "Elevated blood pressure range",
      valueSummary: bpSummary,
      explanation: id ? "Rentang ini menjadi sinyal awal untuk memperhatikan pola pengukuran, terutama bila berulang." : "This range is an early awareness signal, especially when repeated.",
      meaning: id ? "Pengukuran berulang saat tenang lebih bermakna daripada satu angka tunggal." : "Repeated calm measurements matter more than one isolated number.",
      food: id ? "Mulai sadar garam, baca label makanan olahan, dan pilih lebih banyak buah serta sayur." : "Build salt awareness, read processed food labels, and add more fruit and vegetables.",
      lifestyle: id ? "Istirahat sebelum ukur, tidur cukup, catat pola, dan kelola stres." : "Rest before measuring, sleep well, track patterns, and manage stress.",
      activity: id ? "Jalan kaki 10-20 menit secara bertahap bisa menjadi awal yang realistis." : "A gradual 10-20 minute walking habit is a realistic start.",
      safety: id ? "Ini bukan diagnosis hipertensi. Bila sering tinggi, diskusikan dengan tenaga kesehatan." : "This is not a hypertension diagnosis. Repeated elevation should be discussed with a clinician.",
      moduleLabel: shared.bpModule,
      modulePath: "/disease/hypertension",
    },
    bp_high: {
      tone: "alert",
      category: id ? "Rentang tekanan darah tinggi" : "High blood pressure range",
      valueSummary: bpSummary,
      explanation: id ? "Rentang ini perlu dipahami sebagai sinyal edukasi yang memerlukan konfirmasi pengukuran berulang." : "This range is an education signal that needs repeated measurement and professional confirmation.",
      meaning: id ? "Jangan mengubah obat sendiri. Catat angka dan bicarakan dengan tenaga kesehatan." : "Do not self-adjust medication. Track readings and discuss them with a qualified professional.",
      food: id ? "Kurangi garam berlebih, perhatikan makanan kemasan, tambah buah/sayur, dan jaga porsi." : "Reduce excessive salt, check packaged foods, add fruit/vegetables, and keep portions balanced.",
      lifestyle: id ? "Pantau pola, tidur cukup, kelola stres, dan pahami risiko rokok." : "Monitor patterns, support sleep, manage stress, and understand smoking risk.",
      activity: id ? "Jalan kaki bertahap dan gerak ringan konsisten dapat mendukung kesehatan jantung." : "Gradual walking and consistent light movement can support heart health.",
      safety: id ? "Cari bantuan segera bila ada nyeri dada, sesak, lemah, bingung, sakit kepala berat, atau gangguan penglihatan." : "Seek urgent help with chest pain, shortness of breath, weakness, confusion, severe headache, or vision changes.",
      moduleLabel: shared.bpModule,
      modulePath: "/disease/hypertension",
    },
    bp_very_high: {
      tone: "alert",
      category: id ? "Rentang sangat tinggi" : "Very high blood pressure range",
      valueSummary: bpSummary,
      explanation: id ? "Rentang sangat tinggi perlu ditanggapi dengan tenang tetapi serius, terutama jika disertai gejala." : "A very high range should be handled calmly but seriously, especially with symptoms.",
      meaning: id ? "Edukasi saja tidak cukup bila ada tanda bahaya. Jangan panik, tetapi prioritaskan keselamatan." : "Education is not enough when red flags appear. Stay calm and prioritize safety.",
      food: id ? "Perubahan makanan tidak cukup untuk situasi mendesak. Fokus pada keselamatan dulu." : "Food changes are not enough for an urgent situation. Focus on safety first.",
      lifestyle: id ? "Duduk tenang, ulang ukur sesuai petunjuk alat, dan cari bantuan bila gejala muncul." : "Sit calmly, recheck according to device guidance, and seek help if symptoms appear.",
      activity: id ? "Jangan memaksakan olahraga saat angka sangat tinggi atau ada gejala." : "Do not force exercise when readings are very high or symptoms are present.",
      safety: id ? "Bantuan medis segera dianjurkan jika ada nyeri dada, sesak, kelemahan, bingung, sakit kepala berat, atau perubahan penglihatan." : "Immediate medical help is recommended with chest pain, breathlessness, weakness, confusion, severe headache, or vision changes.",
      moduleLabel: shared.bpModule,
      modulePath: "/disease/hypertension",
    },
    sugar_low: {
      tone: "alert",
      category: id ? "Rentang gula darah rendah" : "Low blood sugar range",
      valueSummary: sugarSummary,
      explanation: id ? "Rentang rendah dapat berkaitan dengan gemetar, berkeringat, lemas, atau bingung." : "A low range can be associated with shakiness, sweating, weakness, or confusion.",
      meaning: id ? "Perhatikan gejala dan konteks, terutama bila menggunakan obat tertentu atau sering melewatkan makan." : "Notice symptoms and context, especially with certain medicines or skipped meals.",
      food: id ? "Edukasi umum: makan teratur dan jangan sengaja melewatkan makan bila tubuh tidak nyaman." : "General education: keep regular meals and avoid skipping meals when your body feels unwell.",
      lifestyle: id ? "Catat waktu kejadian, aktivitas, dan makanan terakhir untuk diskusi profesional." : "Track timing, activity, and last meal for a professional discussion.",
      activity: id ? "Hindari aktivitas berat saat merasa lemas, gemetar, atau bingung." : "Avoid strenuous activity when weak, shaky, or confused.",
      safety: id ? "Cari bantuan bila gejala berat, bingung, pingsan, atau tidak membaik." : "Seek help for severe symptoms, confusion, fainting, or if it does not improve.",
      moduleLabel: shared.sugarModule,
      modulePath: "/disease/type-2-diabetes",
    },
    sugar_normal: {
      tone: "normal",
      category: id ? "Rentang gula darah edukasi normal" : "Education-normal blood sugar range",
      valueSummary: sugarSummary,
      explanation: id ? "Hasil ini berada dalam rentang yang umum dianggap baik untuk konteks pemeriksaan ini." : "This result is in a range commonly considered favorable for this reading context.",
      meaning: id ? "Tetap lihat riwayat skrining, gejala, dan faktor risiko untuk konteks lengkap." : "Screening history, symptoms, and risk factors still add useful context.",
      food: id ? "Utamakan serat, karbohidrat seimbang, air putih, dan kurangi minuman manis." : "Prioritize fiber, balanced carbohydrates, water, and fewer sugary drinks.",
      lifestyle: id ? "Tidur, gerak setelah makan, dan pemeriksaan berkala mendukung literasi metabolik." : "Sleep, movement after meals, and routine checkups support metabolic literacy.",
      activity: id ? "Jalan santai setelah makan dapat menjadi kebiasaan sederhana yang mendukung metabolisme." : "A gentle walk after meals can be a simple metabolism-supportive habit.",
      safety: id ? "Hasil normal bukan izin untuk konsumsi gula tanpa batas." : "A normal result is not a license for unlimited sugar intake.",
      moduleLabel: shared.sugarModule,
      modulePath: "/disease/type-2-diabetes",
    },
    sugar_fasting_elevated: {
      tone: "watch",
      category: id ? "Gula darah puasa meningkat" : "Elevated fasting blood sugar",
      valueSummary: sugarSummary,
      explanation: id ? "Rentang meningkat dapat membantu memahami literasi prediabetes, tetapi bukan diagnosis." : "An elevated fasting range can support prediabetes literacy, but it is not a diagnosis.",
      meaning: id ? "Konfirmasi profesional dan tes yang sesuai lebih baik daripada menebak dari satu angka." : "Professional confirmation and proper testing are better than guessing from one number.",
      food: id ? "Kurangi minuman manis, perhatikan karbohidrat olahan, porsi, dan tambah serat." : "Reduce sweet drinks, watch refined carbs and portions, and increase fiber.",
      lifestyle: id ? "Tidur, stres, pola makan, dan berat badan adalah konteks edukasi yang perlu dipahami." : "Sleep, stress, eating patterns, and weight context are useful education areas.",
      activity: id ? "Jalan kaki rutin, cardio ringan, dan latihan kekuatan pemula dapat mendukung kesehatan metabolik secara umum." : "Regular walking, light cardio, and beginner strength training can generally support metabolic health.",
      safety: id ? "Diskusikan hasil berulang dengan tenaga kesehatan." : "Discuss repeated elevation with a qualified professional.",
      moduleLabel: shared.sugarModule,
      modulePath: "/disease/type-2-diabetes",
    },
    sugar_fasting_high: {
      tone: "alert",
      category: id ? "Gula darah puasa tinggi" : "High fasting blood sugar",
      valueSummary: sugarSummary,
      explanation: id ? "Rentang tinggi memerlukan konfirmasi melalui pemeriksaan yang sesuai, bukan diagnosis mandiri." : "A high range needs confirmation with appropriate testing, not self-diagnosis.",
      meaning: id ? "Perhatikan gejala seperti sering buang air kecil, haus, lemas, muntah, atau bingung." : "Notice symptoms such as frequent urination, thirst, weakness, vomiting, or confusion.",
      food: id ? "Kurangi minuman manis, karbohidrat olahan, dan jaga pola makan konsisten." : "Reduce sugary drinks and refined carbs, and keep meals consistent.",
      lifestyle: id ? "Hidrasi, tidur, gerak, dan jadwal checkup membantu percakapan kesehatan yang lebih baik." : "Hydration, sleep, movement, and checkups help better health conversations.",
      activity: id ? "Gerak bertahap seperti jalan kaki atau cardio ringan bisa membantu kebiasaan, jika tubuh terasa aman." : "Gradual movement such as walking or light cardio can support habits when your body feels safe.",
      safety: id ? "Cari bantuan bila ada muntah, bingung, sangat lemas, atau gejala memburuk." : "Seek help for vomiting, confusion, severe weakness, or worsening symptoms.",
      moduleLabel: shared.sugarModule,
      modulePath: "/disease/type-2-diabetes",
    },
    sugar_random_high: {
      tone: "alert",
      category: id ? "Gula darah sewaktu tinggi" : "High random blood sugar",
      valueSummary: sugarSummary,
      explanation: id ? "Gula sewaktu tinggi perlu dipahami dengan konteks makan terakhir, gejala, dan tes konfirmasi." : "A high random reading needs context from recent meals, symptoms, and confirmatory tests.",
      meaning: id ? "Jangan menyimpulkan diagnosis dari satu angka, tetapi jangan abaikan bila berulang atau bergejala." : "Do not conclude diagnosis from one number, but do not ignore repeated or symptomatic readings.",
      food: id ? "Kurangi minuman manis, karbohidrat olahan, dan susun makan lebih konsisten." : "Reduce sweet drinks and refined carbs, and keep meals more consistent.",
      lifestyle: id ? "Catat waktu makan, nilai, gejala, tidur, dan hidrasi untuk diskusi profesional." : "Track meal timing, readings, symptoms, sleep, and hydration for professional discussion.",
      activity: id ? "Jalan santai setelah makan dapat menjadi edukasi kebiasaan, selama tidak ada gejala berat." : "Gentle post-meal walking can be a habit lesson when no severe symptoms are present.",
      safety: id ? "Cari bantuan bila sering kencing, sangat haus, lemas berat, muntah, atau bingung." : "Seek help for frequent urination, intense thirst, severe weakness, vomiting, or confusion.",
      moduleLabel: shared.sugarModule,
      modulePath: "/disease/type-2-diabetes",
    },
    bmi_underweight: {
      tone: "watch",
      category: id ? "BMI kurang" : "Underweight BMI range",
      valueSummary: bmiSummary,
      explanation: id ? "BMI dapat menjadi alat skrining kasar, tetapi tidak membaca komposisi tubuh atau kondisi personal." : "BMI is a rough screening tool and does not read body composition or personal context.",
      meaning: id ? "Rentang kurang dapat menjadi alasan untuk memahami asupan, energi, dan kesehatan umum." : "An underweight range can be a reason to understand intake, energy, and general health.",
      food: id ? "Edukasi umum: makan seimbang, protein cukup, dan makanan padat nutrisi." : "General education: balanced meals, enough protein, and nutrient-dense foods.",
      lifestyle: id ? "Tidur, rutinitas makan, dan checkup penting bila ada kekhawatiran." : "Sleep, meal routines, and checkups matter when there are concerns.",
      activity: id ? "Gerak ramah kekuatan secara bertahap dapat mendukung massa otot, jika nyaman dan aman." : "Gradual strength-friendly movement can support muscle, when comfortable and safe.",
      safety: id ? "Konsultasikan jika berat turun tanpa sebab, lemas, atau nafsu makan terganggu." : "Consult if weight drops unexpectedly, weakness appears, or appetite is affected.",
      moduleLabel: shared.libraryModule,
      modulePath: "/library",
    },
    bmi_normal: {
      tone: "normal",
      category: id ? "BMI normal" : "Normal BMI range",
      valueSummary: bmiSummary,
      explanation: id ? "Rentang ini umum dianggap normal, tetapi BMI tetap hanya salah satu indikator." : "This range is commonly considered normal, but BMI is still only one indicator.",
      meaning: id ? "Kebiasaan harian tetap lebih penting daripada satu angka." : "Daily habits still matter more than one number.",
      food: id ? "Pertahankan piring seimbang, hidrasi, protein, dan serat." : "Maintain balanced meals, hydration, protein, and fiber.",
      lifestyle: id ? "Tidur, kelola stres, dan pemeriksaan rutin mendukung kesehatan jangka panjang." : "Sleep, stress care, and routine checkups support long-term health.",
      activity: id ? "Gabungkan jalan kaki, cardio ringan, dan latihan kekuatan pemula sesuai kemampuan." : "Combine walking, light cardio, and beginner strength training as comfortable.",
      safety: id ? "BMI normal tidak menggantikan pemeriksaan bila ada keluhan." : "Normal BMI does not replace assessment when symptoms exist.",
      moduleLabel: shared.libraryModule,
      modulePath: "/library",
    },
    bmi_overweight: {
      tone: "watch",
      category: id ? "BMI overweight" : "Overweight BMI range",
      valueSummary: bmiSummary,
      explanation: id ? "Rentang overweight adalah bahan edukasi, bukan penilaian diri. BMI punya keterbatasan." : "An overweight range is education context, not self-judgment. BMI has limitations.",
      meaning: id ? "Fokus pada kebiasaan berkelanjutan, bukan diet ekstrem atau rasa malu." : "Focus on sustainable habits, not extreme dieting or shame.",
      food: id ? "Pelajari porsi, protein, serat, kurangi minuman manis, makanan ultra-proses, dan susun piring seimbang." : "Learn portions, protein, fiber, fewer sugary drinks, less ultra-processed food, and balanced plates.",
      lifestyle: id ? "Tidur dan stres memengaruhi konsistensi. Mulai dari perubahan kecil yang bisa diulang." : "Sleep and stress affect consistency. Start with small repeatable changes.",
      activity: id ? "Cardio mendukung kesehatan jantung/metabolik, sementara strength training atau weightlifting pemula mendukung otot dan metabolisme jangka panjang." : "Cardio supports heart and metabolic health, while beginner strength training or weightlifting supports muscle and long-term metabolism.",
      safety: id ? "Ini bukan rencana diet personal. Konsultasikan bila ada kondisi medis, nyeri, atau kekhawatiran." : "This is not a personal diet plan. Consult when there are medical conditions, pain, or concerns.",
      moduleLabel: id ? "Diabetes Tipe 2 dan Hipertensi" : "Type 2 Diabetes and Hypertension",
      modulePath: "/disease/type-2-diabetes",
    },
    bmi_obesity: {
      tone: "alert",
      category: id ? "BMI rentang obesitas" : "Obesity BMI range",
      valueSummary: bmiSummary,
      explanation: id ? "Rentang ini adalah konteks edukasi yang perlu dibaca dengan keterbatasan BMI dan kondisi personal." : "This range is education context that should be read with BMI limitations and personal context.",
      meaning: id ? "Pendekatan paling aman biasanya bertahap, suportif, dan dibahas dengan profesional bila perlu." : "The safest approach is usually gradual, supportive, and discussed with a professional when needed.",
      food: id ? "Fokus pada kebiasaan makan berkelanjutan: porsi, protein/serat, kurangi minuman manis dan ultra-proses, bukan diet ekstrem." : "Focus on sustainable eating: portions, protein/fiber, fewer sugary drinks and ultra-processed foods, not extreme dieting.",
      lifestyle: id ? "Tidur, stres, checkup rutin, dan dukungan sosial dapat membantu konsistensi." : "Sleep, stress care, routine checkups, and social support can help consistency.",
      activity: id ? "Mulai bertahap: jalan kaki, low-impact cardio, bersepeda/berenang bila nyaman, dan resistance training pemula dengan progres pelan." : "Start gradually: walking, low-impact cardio, cycling/swimming if comfortable, and beginner resistance training with slow progress.",
      safety: id ? "Ini bukan diagnosis atau program personal. Konsultasikan untuk rencana yang sesuai kondisi tubuh dan riwayat kesehatan." : "This is not a diagnosis or personal program. Consult for a plan that fits your body and health history.",
      moduleLabel: id ? "Diabetes Tipe 2 dan Hipertensi" : "Type 2 Diabetes and Hypertension",
      modulePath: "/disease/type-2-diabetes",
    },
  };

  return entries[result.category] ?? entries.bp_normal;
}

function EducationTile({ title, copy, icon: Icon }: { title: string; copy: string; icon: LucideIcon }) {
  return (
    <div className="education-tile">
      <Icon size={20} />
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function ClassifierVisual({ kind, tone }: { kind: ClassifierKind; tone: ClassifierEducation["tone"] }) {
  return (
    <div className={`classifier-visual ${kind} ${tone}`}>
      {kind === "bp" && (
        <>
          <Heart size={30} />
          <div className="pulse-line"><span /></div>
          <div className="gauge-ring" />
        </>
      )}
      {kind === "sugar" && (
        <>
          <Droplets size={30} />
          <div className="glucose-dots"><span /><span /><span /><span /></div>
          <div className="meter-bar"><span /></div>
        </>
      )}
      {kind === "bmi" && (
        <>
          <UserRound size={30} />
          <div className="body-balance"><span /><span /><span /></div>
          <div className="wellness-arc" />
        </>
      )}
    </div>
  );
}

function getClassifierCopy(language: number) {
  if (language === 0) {
    return {
      kicker: "Pemeriksa angka untuk edukasi",
      introTitle: "Pilih alat edukasi",
      introCopy: "Masukkan angka untuk melihat kategori belajar. Ini bukan diagnosis dan tidak menyimpan nilai medis.",
      bp: "Cek Tensi",
      sugar: "Gula Darah",
      systolic: "Sistolik",
      diastolic: "Diastolik",
      sugarValue: "Nilai gula darah",
      readingType: "Jenis pemeriksaan",
      fasting: "Puasa",
      random: "Sewaktu",
      height: "Tinggi badan dalam cm",
      weight: "Berat badan dalam kg",
      empty: "Masukkan nilai untuk melihat kategori edukasi",
      disclaimer: "Classifier ini frontend-only untuk edukasi. Nilai mentah tetap di browser dan tidak dikirim onchain.",
      frontendOnly: "Frontend-only",
      meaning: "Makna",
      food: "Panduan makanan",
      lifestyle: "Kebiasaan",
      activity: "Aktivitas fisik",
      recommended: "Rekomendasi modul",
      openModule: "Buka modul",
    };
  }

  return {
    kicker: "Education-focused number checks",
    introTitle: "Choose an education tool",
    introCopy: "Enter numbers to see a learning category. This is not diagnosis and does not store medical values.",
    bp: "Blood Pressure",
    sugar: "Blood Sugar",
    systolic: "Systolic",
    diastolic: "Diastolic",
    sugarValue: "Blood sugar value",
    readingType: "Reading type",
    fasting: "Fasting",
    random: "Random",
    height: "Height in cm",
    weight: "Weight in kg",
    empty: "Enter values to see education category",
    disclaimer: "This classifier is frontend-only education. Raw values stay in your browser and are not sent onchain.",
    frontendOnly: "Frontend-only",
    meaning: "Meaning",
    food: "Food guidance",
    lifestyle: "Lifestyle",
    activity: "Physical activity",
    recommended: "Recommended module",
    openModule: "Open module",
  };
}

function getClassifierResultLabel(category: string, fallback: string, language: number) {
  if (language !== 0) return fallback;
  const labels: Record<string, string> = {
    bp_very_high: "Rentang sangat tinggi",
    bp_high: "Rentang tinggi",
    bp_elevated: "Rentang meningkat",
    bp_normal: "Rentang normal",
    sugar_low: "Rentang rendah",
    sugar_random_high: "Gula sewaktu tinggi",
    sugar_fasting_high: "Gula puasa tinggi",
    sugar_fasting_elevated: "Gula puasa meningkat",
    sugar_normal: "Rentang edukasi normal",
    bmi_underweight: "BMI kurang",
    bmi_normal: "BMI normal",
    bmi_overweight: "BMI overweight",
    bmi_obesity: "BMI rentang obesitas",
  };
  return labels[category] ?? fallback;
}

function normalizeProfile(value: unknown): Profile {
  const source = value as Record<string, unknown> & readonly unknown[];
  const read = (key: keyof Profile, index: number, fallback: unknown = "") => source?.[key] ?? source?.[index] ?? fallback;

  return {
    displayName: String(read("displayName", 0)),
    constualUsername: String(read("constualUsername", 1)),
    xUsername: stripX(String(read("xUsername", 2))),
    preferredLanguage: Number(read("preferredLanguage", 3, 0)),
    xp: toBigInt(read("xp", 4, 0)),
    completedCount: toBigInt(read("completedCount", 5, 0)),
    badgeCount: toBigInt(read("badgeCount", 6, 0)),
    streak: toBigInt(read("streak", 7, 0)),
    lastActiveDay: toBigInt(read("lastActiveDay", 8, 0)),
    totalScore: toBigInt(read("totalScore", 9, 0)),
    quizCount: toBigInt(read("quizCount", 10, 0)),
    classifierUseCount: toBigInt(read("classifierUseCount", 11, 0)),
    agentGuideCount: toBigInt(read("agentGuideCount", 12, 0)),
    createdAt: toBigInt(read("createdAt", 13, 0)),
    updatedAt: toBigInt(read("updatedAt", 14, 0)),
    exists: Boolean(read("exists", 15, true)),
  };
}

function toBigInt(value: unknown) {
  try {
    return typeof value === "bigint" ? value : BigInt(String(value ?? 0));
  } catch {
    return 0n;
  }
}

function normalizeForm(form: ProfileForm): ProfileForm {
  return {
    displayName: form.displayName.trim(),
    constualUsername: form.constualUsername.trim().toLowerCase(),
    xUsername: stripX(form.xUsername.trim()),
    preferredLanguage: Number(form.preferredLanguage),
  };
}

function validateProfileForm(form: ProfileForm) {
  if (!form.displayName || form.displayName.length > 80) return "Display Name is required and must be 1-80 characters.";
  if (!/^[a-z0-9_]{3,24}$/.test(form.constualUsername)) return "Constual Username must be lowercase a-z, 0-9, underscore, 3-24 chars.";
  if (form.xUsername && !/^[A-Za-z0-9_]{1,15}$/.test(form.xUsername)) return "X Username must be 1-15 letters, numbers, or underscore.";
  if (![0, 1].includes(form.preferredLanguage)) return "Preferred Language must be Indonesia or English.";
  return "";
}

function stripX(value: string) {
  return value.replace(/^@+/, "").trim();
}

function readableError(error: unknown) {
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (
      lower.includes("not available") ||
      lower.includes("already completed") ||
      lower.includes("already claimed") ||
      lower.includes("not claimable") ||
      lower.includes("score must") ||
      lower.includes("invalid diseaseid")
    ) {
      return error.message;
    }
    if (lower.includes("user rejected") || lower.includes("user denied")) return "Wallet confirmation was rejected.";
    // no gas — the most common failure on a fresh testnet wallet
    if (
      lower.includes("insufficient funds") ||
      lower.includes("insufficient balance") ||
      lower.includes("gas required exceeds") ||
      lower.includes("cannot estimate gas")
    ) {
      return "Not enough RITUAL for gas. Get testnet RITUAL from the Ritual faucet, then try again.";
    }
    // MetaMask wraps wallet-side RPC/gas failures as this generic error
    if (lower.includes("internal json-rpc error")) {
      return "Wallet couldn't submit the transaction — usually no RITUAL for gas, or your wallet's Ritual network RPC is stale. Top up RITUAL and re-add the Ritual network (RPC https://rpc.ritualfoundation.org, chain 1979).";
    }
    if (lower.includes("execution reverted")) return "Transaction reverted. Contract state, ABI, or eligibility check failed.";
    if (lower.includes("abi")) return "ABI mismatch suspected. Please check ConstualCore function signatures.";
  }
  return "Transaction failed. Please check wallet, network, and contract state.";
}

function shortAddress(address?: Address | null) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected";
}

function formatBigint(value: bigint) {
  return Number(value).toLocaleString();
}

export default App;
