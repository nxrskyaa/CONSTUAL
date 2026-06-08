import {
  Activity,
  BadgeCheck,
  BookOpen,
  Droplets,
  HeartPulse,
  Moon,
  ShieldCheck,
  Soup,
  type LucideIcon,
} from "lucide-react";

export const languageLabels = ["Indonesia", "English"] as const;

export type Disease = {
  id: number;
  name: string;
  localName: string;
  summary: string;
  lesson: string;
  quiz: { question: string; options: string[]; answer: number };
  icon: LucideIcon;
};

export const diseases: Disease[] = [
  {
    id: 1,
    name: "Common Cold",
    localName: "Flu Ringan",
    summary: "Basic education about mild viral respiratory symptoms and supportive care.",
    lesson: "Most common colds improve with rest, fluids, and symptom monitoring.",
    quiz: {
      question: "What is the safest first step for a mild common cold?",
      options: ["Rest, fluids, and monitor symptoms", "Use antibiotics immediately", "Ignore fever for a week"],
      answer: 0,
    },
    icon: ShieldCheck,
  },
  {
    id: 2,
    name: "Hypertension",
    localName: "Hipertensi",
    summary: "Learn what blood pressure ranges can mean and when to seek care.",
    lesson: "Repeated high readings should be discussed with a qualified health professional.",
    quiz: {
      question: "What should someone do with repeated high blood pressure readings?",
      options: ["Record readings and consult a clinician", "Stop all movement", "Double medicine without advice"],
      answer: 0,
    },
    icon: HeartPulse,
  },
  {
    id: 3,
    name: "Type 2 Diabetes",
    localName: "Diabetes Tipe 2",
    summary: "Understand blood sugar awareness, screening, and daily habits.",
    lesson: "Blood sugar education supports safer conversations with health workers.",
    quiz: {
      question: "What can help blood sugar awareness?",
      options: ["Screening and balanced habits", "Skipping all meals", "Only checking when dizzy"],
      answer: 0,
    },
    icon: Droplets,
  },
  {
    id: 4,
    name: "GERD",
    localName: "GERD",
    summary: "Learn common reflux triggers and education-safe lifestyle basics.",
    lesson: "Smaller meals, trigger awareness, and medical review for alarm symptoms matter.",
    quiz: {
      question: "Which habit can reduce reflux symptoms for some people?",
      options: ["Avoid lying down right after meals", "Eat faster", "Ignore chest pain"],
      answer: 0,
    },
    icon: Soup,
  },
  {
    id: 5,
    name: "Dengue Fever",
    localName: "Demam Berdarah",
    summary: "Learn warning signs, mosquito prevention, and when care is urgent.",
    lesson: "Severe abdominal pain, bleeding, or persistent vomiting need urgent medical care.",
    quiz: {
      question: "Which dengue sign needs urgent care?",
      options: ["Bleeding or persistent vomiting", "Mild tiredness only", "Mosquito bite without fever"],
      answer: 0,
    },
    icon: Activity,
  },
];

export type AgentScenario = {
  id: number;
  diseaseIds: number[];
  title: string;
  user: { id: string; en: string };
  report: {
    id: AgentAnswer;
    en: AgentAnswer;
  };
};

export type AgentAnswer = {
  explanation: string;
  meaning: string;
  food: string;
  lifestyle: string;
  safety: string;
};

const safetyId =
  "Constual hanya untuk edukasi. Fitur ini tidak memberikan diagnosis, keputusan pengobatan, rencana diet personal, atau saran medis darurat.";
const safetyEn =
  "Constual is for education only. It does not provide diagnosis, treatment decisions, personal diet plans, or emergency medical advice.";

function answer(en: Omit<AgentAnswer, "safety">, id: Omit<AgentAnswer, "safety">): AgentScenario["report"] {
  return {
    en: { ...en, safety: safetyEn },
    id: { ...id, safety: safetyId },
  };
}

export const agentScenarios: AgentScenario[] = [
  {
    id: 1,
    diseaseIds: [2],
    title: "Blood pressure normal",
    user: { en: "My blood pressure is around 118/76. What does that mean?", id: "Tensi saya sekitar 118/76. Artinya apa?" },
    report: answer(
      {
        explanation: "That reading is commonly understood as a normal blood pressure range for many adults.",
        meaning: "A single normal reading is reassuring, but regular measurement gives better context.",
        food: "Keep meals balanced with vegetables, fruit, whole grains, and moderate salt.",
        lifestyle: "Continue walking, sleep routines, stress control, and avoiding tobacco exposure.",
      },
      {
        explanation: "Angka tersebut umumnya termasuk rentang tekanan darah normal untuk banyak orang dewasa.",
        meaning: "Satu hasil normal cukup menenangkan, tetapi pengukuran berkala memberi konteks lebih baik.",
        food: "Pertahankan makan seimbang dengan sayur, buah, biji utuh, dan garam secukupnya.",
        lifestyle: "Lanjutkan berjalan kaki, pola tidur, kendali stres, dan hindari paparan rokok.",
      },
    ),
  },
  {
    id: 2,
    diseaseIds: [2],
    title: "Blood pressure elevated",
    user: { en: "My blood pressure is near 130/84. Should I learn anything?", id: "Tensi saya sekitar 130/84. Apa yang perlu dipelajari?" },
    report: answer(
      {
        explanation: "This can be an elevated range, especially if it repeats across several calm measurements.",
        meaning: "Repeated readings matter more than one isolated number.",
        food: "Learn salt awareness and choose less processed foods when possible.",
        lifestyle: "Measure after resting, record results, and discuss patterns with a clinician.",
      },
      {
        explanation: "Ini bisa termasuk rentang meningkat, terutama jika berulang saat pengukuran tenang.",
        meaning: "Hasil yang berulang lebih penting daripada satu angka saja.",
        food: "Pelajari kesadaran garam dan pilih makanan minim proses bila memungkinkan.",
        lifestyle: "Ukur setelah istirahat, catat hasil, dan diskusikan polanya dengan tenaga kesehatan.",
      },
    ),
  },
  {
    id: 3,
    diseaseIds: [2],
    title: "Blood pressure high",
    user: { en: "My reading is 148/94. What education should I see?", id: "Hasil saya 148/94. Edukasi apa yang perlu saya lihat?" },
    report: answer(
      {
        explanation: "This is commonly considered high if confirmed by repeated readings.",
        meaning: "High readings are a reason to seek proper assessment, not to self-adjust medication.",
        food: "Review salt, packaged foods, sugary drinks, and portion balance.",
        lifestyle: "Track readings and arrange a non-emergency consultation unless severe symptoms appear.",
      },
      {
        explanation: "Angka ini umumnya dianggap tinggi bila terkonfirmasi dari pengukuran berulang.",
        meaning: "Tensi tinggi adalah alasan untuk pemeriksaan, bukan mengubah obat sendiri.",
        food: "Tinjau garam, makanan kemasan, minuman manis, dan keseimbangan porsi.",
        lifestyle: "Catat tensi dan atur konsultasi non-darurat kecuali ada gejala berat.",
      },
    ),
  },
  {
    id: 4,
    diseaseIds: [2],
    title: "Blood pressure very high",
    user: { en: "My blood pressure is extremely high with headache.", id: "Tensi saya sangat tinggi dan sakit kepala." },
    report: answer(
      {
        explanation: "Very high readings with symptoms can be urgent.",
        meaning: "Education is not enough when severe symptoms appear.",
        food: "Do not rely on food changes for an urgent episode.",
        lifestyle: "Seek urgent medical care, especially with chest pain, weakness, confusion, or breathlessness.",
      },
      {
        explanation: "Tensi sangat tinggi dengan gejala bisa bersifat darurat.",
        meaning: "Edukasi saja tidak cukup bila muncul gejala berat.",
        food: "Jangan mengandalkan perubahan makan untuk kondisi yang mendesak.",
        lifestyle: "Segera cari bantuan medis, terutama bila ada nyeri dada, lemah, bingung, atau sesak.",
      },
    ),
  },
  {
    id: 5,
    diseaseIds: [3],
    title: "Blood sugar normal",
    user: { en: "My fasting sugar is in a normal range. What next?", id: "Gula darah puasa saya normal. Lalu apa?" },
    report: answer(
      {
        explanation: "A normal fasting result is encouraging, but it is still one data point.",
        meaning: "Screening history, symptoms, and risk factors add context.",
        food: "Keep fiber-rich meals and avoid turning normal results into unlimited sugar intake.",
        lifestyle: "Movement after meals and regular sleep can support metabolic health.",
      },
      {
        explanation: "Hasil puasa normal menggembirakan, tetapi tetap hanya satu data.",
        meaning: "Riwayat skrining, gejala, dan faktor risiko memberi konteks tambahan.",
        food: "Pertahankan makanan tinggi serat dan jangan menganggap hasil normal berarti bebas gula.",
        lifestyle: "Bergerak setelah makan dan tidur teratur dapat mendukung kesehatan metabolik.",
      },
    ),
  },
  {
    id: 6,
    diseaseIds: [3],
    title: "Blood sugar elevated",
    user: { en: "My sugar is slightly elevated. What should I learn?", id: "Gula darah saya agak meningkat. Apa yang perlu dipelajari?" },
    report: answer(
      {
        explanation: "Slight elevation can happen for many reasons and should be interpreted with context.",
        meaning: "Repeat testing and clinician guidance are better than guessing.",
        food: "Learn carbohydrate portions, sweet drink reduction, and balanced plates.",
        lifestyle: "Walking, sleep, and stress management may support healthier patterns.",
      },
      {
        explanation: "Kenaikan ringan bisa terjadi karena banyak hal dan perlu konteks.",
        meaning: "Tes ulang dan arahan tenaga kesehatan lebih baik daripada menebak.",
        food: "Pelajari porsi karbohidrat, kurangi minuman manis, dan susun piring seimbang.",
        lifestyle: "Berjalan kaki, tidur, dan kelola stres dapat mendukung pola lebih sehat.",
      },
    ),
  },
  {
    id: 7,
    diseaseIds: [3],
    title: "Blood sugar high",
    user: { en: "My fasting sugar looks high.", id: "Gula darah puasa saya terlihat tinggi." },
    report: answer(
      {
        explanation: "A high fasting result should be reviewed with a qualified health professional.",
        meaning: "It may indicate a need for formal testing or follow-up.",
        food: "Avoid crash diets; focus on consistent, balanced meals.",
        lifestyle: "Keep a log and arrange care, especially if thirst, frequent urination, or weight loss occurs.",
      },
      {
        explanation: "Hasil puasa tinggi sebaiknya ditinjau bersama tenaga kesehatan.",
        meaning: "Ini bisa menunjukkan perlunya tes formal atau tindak lanjut.",
        food: "Hindari diet ekstrem; fokus pada makan seimbang yang konsisten.",
        lifestyle: "Catat hasil dan cari pemeriksaan, terutama bila sering haus, sering BAK, atau turun berat badan.",
      },
    ),
  },
  {
    id: 8,
    diseaseIds: [3],
    title: "Random sugar high",
    user: { en: "My random blood sugar is high after a meal.", id: "Gula darah sewaktu saya tinggi setelah makan." },
    report: answer(
      {
        explanation: "Random readings after meals vary, but very high values deserve follow-up.",
        meaning: "Timing, meal content, and symptoms affect interpretation.",
        food: "Pair carbohydrates with protein, fiber, and vegetables where possible.",
        lifestyle: "Avoid panic; note timing and discuss repeated high readings with care providers.",
      },
      {
        explanation: "Gula sewaktu setelah makan bisa bervariasi, tetapi nilai sangat tinggi perlu tindak lanjut.",
        meaning: "Waktu ukur, isi makanan, dan gejala memengaruhi interpretasi.",
        food: "Padukan karbohidrat dengan protein, serat, dan sayur bila memungkinkan.",
        lifestyle: "Jangan panik; catat waktu ukur dan diskusikan hasil berulang dengan tenaga kesehatan.",
      },
    ),
  },
  {
    id: 9,
    diseaseIds: [3],
    title: "Blood sugar low",
    user: { en: "What if my blood sugar is low and I feel shaky?", id: "Bagaimana jika gula darah rendah dan saya gemetar?" },
    report: answer(
      {
        explanation: "Low blood sugar with symptoms can require prompt action.",
        meaning: "People using diabetes medicine should follow their clinician's hypoglycemia plan.",
        food: "Fast-acting carbohydrate may be needed according to a personal care plan.",
        lifestyle: "Seek urgent help if confusion, fainting, or severe symptoms occur.",
      },
      {
        explanation: "Gula darah rendah dengan gejala bisa memerlukan tindakan cepat.",
        meaning: "Pengguna obat diabetes perlu mengikuti rencana hipoglikemia dari tenaga kesehatan.",
        food: "Karbohidrat cepat mungkin diperlukan sesuai rencana perawatan pribadi.",
        lifestyle: "Cari bantuan darurat bila bingung, pingsan, atau gejala berat muncul.",
      },
    ),
  },
  {
    id: 10,
    diseaseIds: [],
    title: "BMI underweight",
    user: { en: "My BMI is underweight. What does that mean?", id: "BMI saya kurang. Artinya apa?" },
    report: answer(
      {
        explanation: "Underweight BMI can reflect nutrition, illness, body type, or recent weight changes.",
        meaning: "BMI is a screening tool, not a diagnosis.",
        food: "Consider balanced energy intake with protein, healthy fats, and micronutrient-rich foods.",
        lifestyle: "Discuss unexplained weight loss or fatigue with a clinician.",
      },
      {
        explanation: "BMI kurang bisa terkait nutrisi, penyakit, tipe tubuh, atau perubahan berat baru-baru ini.",
        meaning: "BMI adalah alat skrining, bukan diagnosis.",
        food: "Pertimbangkan asupan energi seimbang dengan protein, lemak sehat, dan pangan kaya mikronutrien.",
        lifestyle: "Diskusikan penurunan berat tanpa sebab atau lelah berat dengan tenaga kesehatan.",
      },
    ),
  },
  {
    id: 11,
    diseaseIds: [],
    title: "BMI normal",
    user: { en: "My BMI is normal. What should I keep doing?", id: "BMI saya normal. Apa yang perlu dipertahankan?" },
    report: answer(
      {
        explanation: "A normal BMI can be one helpful signal, but it does not measure every part of health.",
        meaning: "Energy, sleep, labs, waist size, and fitness also matter.",
        food: "Keep variety, vegetables, protein, and hydration.",
        lifestyle: "Maintain movement, sleep, and preventive checkups.",
      },
      {
        explanation: "BMI normal adalah sinyal yang berguna, tetapi tidak mengukur semua aspek kesehatan.",
        meaning: "Energi, tidur, pemeriksaan lab, lingkar perut, dan kebugaran juga penting.",
        food: "Pertahankan variasi, sayur, protein, dan hidrasi.",
        lifestyle: "Jaga aktivitas, tidur, dan pemeriksaan pencegahan.",
      },
    ),
  },
  {
    id: 12,
    diseaseIds: [],
    title: "BMI overweight",
    user: { en: "My BMI says overweight.", id: "BMI saya termasuk overweight." },
    report: answer(
      {
        explanation: "Overweight BMI can indicate increased risk, but context matters.",
        meaning: "It is a prompt for learning, tracking, and professional guidance when needed.",
        food: "Start with portion awareness, fiber, protein, and fewer sugary drinks.",
        lifestyle: "Small sustainable changes usually beat extreme short-term plans.",
      },
      {
        explanation: "BMI overweight bisa menunjukkan peningkatan risiko, tetapi konteks tetap penting.",
        meaning: "Ini menjadi pengingat untuk belajar, memantau, dan mencari panduan bila perlu.",
        food: "Mulai dari sadar porsi, serat, protein, dan kurangi minuman manis.",
        lifestyle: "Perubahan kecil yang konsisten biasanya lebih baik daripada rencana ekstrem.",
      },
    ),
  },
  {
    id: 13,
    diseaseIds: [],
    title: "BMI obesity",
    user: { en: "My BMI is in the obesity range.", id: "BMI saya masuk rentang obesitas." },
    report: answer(
      {
        explanation: "Obesity-range BMI can be associated with higher health risks.",
        meaning: "A respectful, long-term plan with professional support is safest.",
        food: "Avoid shame-based dieting; focus on realistic meal structure and nutrition quality.",
        lifestyle: "Begin with gentle movement and discuss screening for related risks.",
      },
      {
        explanation: "BMI rentang obesitas dapat berkaitan dengan risiko kesehatan yang lebih tinggi.",
        meaning: "Rencana jangka panjang yang menghargai kondisi pribadi dan didukung profesional lebih aman.",
        food: "Hindari diet berbasis rasa malu; fokus pada struktur makan realistis dan kualitas nutrisi.",
        lifestyle: "Mulai dari gerakan ringan dan diskusikan skrining risiko terkait.",
      },
    ),
  },
  {
    id: 14,
    diseaseIds: [],
    title: "Healthy food guidance",
    user: { en: "How do I build a healthier plate?", id: "Bagaimana menyusun piring yang lebih sehat?" },
    report: answer(
      {
        explanation: "A healthy plate is a simple learning model for balance.",
        meaning: "It helps you think about variety instead of strict rules.",
        food: "Try vegetables, protein, carbohydrates, fruit, and water in reasonable portions.",
        lifestyle: "Plan meals before you are very hungry to reduce impulsive choices.",
      },
      {
        explanation: "Piring sehat adalah model belajar sederhana untuk keseimbangan.",
        meaning: "Ini membantu memikirkan variasi, bukan aturan kaku.",
        food: "Coba sayur, protein, karbohidrat, buah, dan air dalam porsi wajar.",
        lifestyle: "Rencanakan makan sebelum sangat lapar agar pilihan lebih terarah.",
      },
    ),
  },
  {
    id: 15,
    diseaseIds: [3],
    title: "Sugar awareness",
    user: { en: "How should I think about sugar?", id: "Bagaimana memahami gula dengan aman?" },
    report: answer(
      {
        explanation: "Sugar awareness is about patterns, portions, and drinks.",
        meaning: "It does not mean every sweet food is forbidden.",
        food: "Start with sweet drinks because they can add sugar quickly.",
        lifestyle: "Read labels and notice energy dips after high-sugar snacks.",
      },
      {
        explanation: "Kesadaran gula berkaitan dengan pola, porsi, dan minuman.",
        meaning: "Ini tidak berarti semua makanan manis dilarang.",
        food: "Mulai dari minuman manis karena gula bisa cepat bertambah.",
        lifestyle: "Baca label dan amati penurunan energi setelah camilan tinggi gula.",
      },
    ),
  },
  {
    id: 16,
    diseaseIds: [2],
    title: "Salt awareness",
    user: { en: "Why does salt matter for blood pressure?", id: "Mengapa garam penting untuk tensi?" },
    report: answer(
      {
        explanation: "For some people, high sodium intake can contribute to higher blood pressure.",
        meaning: "Packaged foods and sauces can contain hidden salt.",
        food: "Compare labels, taste before adding salt, and use herbs or spices.",
        lifestyle: "Combine salt awareness with sleep, movement, and regular measurement.",
      },
      {
        explanation: "Pada sebagian orang, asupan natrium tinggi dapat berkontribusi pada tensi lebih tinggi.",
        meaning: "Makanan kemasan dan saus bisa mengandung garam tersembunyi.",
        food: "Bandingkan label, cicip sebelum menambah garam, dan gunakan rempah.",
        lifestyle: "Gabungkan kesadaran garam dengan tidur, gerak, dan pengukuran rutin.",
      },
    ),
  },
  {
    id: 17,
    diseaseIds: [],
    title: "Hydration",
    user: { en: "How much should I think about hydration?", id: "Seberapa penting hidrasi?" },
    report: answer(
      {
        explanation: "Hydration supports concentration, digestion, and daily comfort.",
        meaning: "Needs vary with weather, activity, and health conditions.",
        food: "Water is the default; fruit and soups can contribute fluids too.",
        lifestyle: "Seek care for severe dehydration signs such as confusion or fainting.",
      },
      {
        explanation: "Hidrasi mendukung konsentrasi, pencernaan, dan kenyamanan harian.",
        meaning: "Kebutuhan berbeda menurut cuaca, aktivitas, dan kondisi kesehatan.",
        food: "Air putih menjadi pilihan utama; buah dan sup juga membantu cairan.",
        lifestyle: "Cari bantuan bila ada tanda dehidrasi berat seperti bingung atau pingsan.",
      },
    ),
  },
  {
    id: 18,
    diseaseIds: [],
    title: "Lifestyle habits",
    user: { en: "What habits matter most?", id: "Kebiasaan apa yang paling penting?" },
    report: answer(
      {
        explanation: "Foundational habits include food quality, movement, sleep, and not smoking.",
        meaning: "Small repeatable actions are easier to maintain.",
        food: "Keep easy healthy options visible at home.",
        lifestyle: "Pick one habit to practice this week instead of changing everything.",
      },
      {
        explanation: "Kebiasaan dasar mencakup kualitas makan, gerak, tidur, dan tidak merokok.",
        meaning: "Tindakan kecil yang berulang lebih mudah dipertahankan.",
        food: "Sediakan pilihan sehat yang mudah terlihat di rumah.",
        lifestyle: "Pilih satu kebiasaan untuk dilatih minggu ini, bukan mengubah semuanya sekaligus.",
      },
    ),
  },
  {
    id: 19,
    diseaseIds: [],
    title: "Sleep and stress",
    user: { en: "Can sleep and stress affect health?", id: "Apakah tidur dan stres memengaruhi kesehatan?" },
    report: answer(
      {
        explanation: "Sleep and stress can affect appetite, blood pressure, and energy.",
        meaning: "They are part of health education, not side details.",
        food: "Limit caffeine late in the day if it disrupts sleep.",
        lifestyle: "Try consistent wake times, wind-down routines, and support for persistent stress.",
      },
      {
        explanation: "Tidur dan stres dapat memengaruhi nafsu makan, tekanan darah, dan energi.",
        meaning: "Keduanya bagian dari edukasi kesehatan, bukan hal sampingan.",
        food: "Batasi kafein sore/malam bila mengganggu tidur.",
        lifestyle: "Coba jam bangun konsisten, rutinitas menenangkan, dan dukungan bila stres menetap.",
      },
    ),
  },
  {
    id: 20,
    diseaseIds: [],
    title: "Walking and movement",
    user: { en: "Is walking enough to start?", id: "Apakah berjalan kaki cukup untuk mulai?" },
    report: answer(
      {
        explanation: "Walking is an accessible way to begin moving more.",
        meaning: "Consistency and safety matter more than intensity at the start.",
        food: "Eat enough to support activity and hydrate well.",
        lifestyle: "Start gently and increase only if it feels safe for your condition.",
      },
      {
        explanation: "Berjalan kaki adalah cara mudah untuk mulai lebih aktif.",
        meaning: "Konsistensi dan keamanan lebih penting daripada intensitas di awal.",
        food: "Makan cukup untuk mendukung aktivitas dan jaga hidrasi.",
        lifestyle: "Mulai perlahan dan tingkatkan hanya bila aman bagi kondisi Anda.",
      },
    ),
  },
  {
    id: 21,
    diseaseIds: [1, 5],
    title: "Infection prevention",
    user: { en: "How can I reduce infection spread?", id: "Bagaimana mengurangi penyebaran infeksi?" },
    report: answer(
      {
        explanation: "Hand hygiene, ventilation, and staying home when sick can reduce spread.",
        meaning: "Prevention protects both you and people around you.",
        food: "Nutrition supports general health but does not replace prevention steps.",
        lifestyle: "Use masks when appropriate and seek care for severe or worsening symptoms.",
      },
      {
        explanation: "Cuci tangan, ventilasi, dan tinggal di rumah saat sakit dapat mengurangi penyebaran.",
        meaning: "Pencegahan melindungi diri dan orang sekitar.",
        food: "Nutrisi mendukung kesehatan umum tetapi tidak menggantikan pencegahan.",
        lifestyle: "Gunakan masker bila sesuai dan cari bantuan jika gejala berat atau memburuk.",
      },
    ),
  },
  {
    id: 22,
    diseaseIds: [1],
    title: "Common cold basics",
    user: { en: "What are common cold basics?", id: "Apa dasar edukasi flu ringan?" },
    report: answer(
      {
        explanation: "Common colds are usually viral and improve with supportive care.",
        meaning: "Symptoms should be monitored, especially fever or breathing issues.",
        food: "Warm fluids can feel soothing, but they are not a cure.",
        lifestyle: "Rest and avoid spreading illness while symptomatic.",
      },
      {
        explanation: "Flu ringan biasanya disebabkan virus dan membaik dengan perawatan pendukung.",
        meaning: "Gejala perlu dipantau, terutama demam atau gangguan napas.",
        food: "Cairan hangat bisa menenangkan, tetapi bukan obat penyembuh.",
        lifestyle: "Istirahat dan hindari menularkan penyakit saat bergejala.",
      },
    ),
  },
  {
    id: 23,
    diseaseIds: [1],
    title: "Antibiotic myth",
    user: { en: "Do antibiotics cure colds?", id: "Apakah antibiotik menyembuhkan flu?" },
    report: answer(
      {
        explanation: "Antibiotics do not treat typical viral colds.",
        meaning: "Unnecessary antibiotics can cause side effects and resistance.",
        food: "Focus on hydration and balanced meals while recovering.",
        lifestyle: "Use medicines only as directed by qualified health professionals.",
      },
      {
        explanation: "Antibiotik tidak mengobati flu yang umumnya disebabkan virus.",
        meaning: "Antibiotik yang tidak perlu dapat menimbulkan efek samping dan resistensi.",
        food: "Fokus pada hidrasi dan makan seimbang saat pemulihan.",
        lifestyle: "Gunakan obat sesuai arahan tenaga kesehatan.",
      },
    ),
  },
  {
    id: 24,
    diseaseIds: [5],
    title: "Dengue warning signs",
    user: { en: "What dengue warning signs should I know?", id: "Tanda bahaya DBD apa yang perlu saya tahu?" },
    report: answer(
      {
        explanation: "Warning signs include severe abdominal pain, persistent vomiting, bleeding, lethargy, or breathing difficulty.",
        meaning: "These signs require urgent medical assessment.",
        food: "Hydration matters, but urgent signs should not be managed at home only.",
        lifestyle: "Seek care quickly if warning signs appear after fever.",
      },
      {
        explanation: "Tanda bahaya meliputi nyeri perut hebat, muntah terus, perdarahan, lemas berat, atau sesak.",
        meaning: "Tanda ini memerlukan pemeriksaan medis segera.",
        food: "Hidrasi penting, tetapi tanda bahaya tidak cukup ditangani di rumah.",
        lifestyle: "Segera cari bantuan bila tanda bahaya muncul setelah demam.",
      },
    ),
  },
  {
    id: 25,
    diseaseIds: [5],
    title: "Mosquito prevention",
    user: { en: "How do I reduce mosquito breeding?", id: "Bagaimana mengurangi sarang nyamuk?" },
    report: answer(
      {
        explanation: "Mosquito prevention includes removing standing water and using protection from bites.",
        meaning: "Community prevention reduces dengue risk.",
        food: "Food does not prevent mosquito bites, but general nutrition supports resilience.",
        lifestyle: "Check containers, drains, and water storage regularly.",
      },
      {
        explanation: "Pencegahan nyamuk mencakup menghilangkan air tergenang dan melindungi diri dari gigitan.",
        meaning: "Pencegahan bersama menurunkan risiko DBD.",
        food: "Makanan tidak mencegah gigitan nyamuk, tetapi nutrisi umum mendukung daya tahan.",
        lifestyle: "Periksa wadah, saluran, dan tempat penyimpanan air secara rutin.",
      },
    ),
  },
];

export const navItems = [
  { id: "passport", label: "Passport", icon: BadgeCheck },
  { id: "learn", label: "Learn", icon: BookOpen },
  { id: "classifier", label: "Classifier", icon: Activity },
  { id: "agent", label: "Agent", icon: Moon },
  { id: "leaderboard", label: "Leaderboard", icon: ShieldCheck },
] as const;

export type NavId = (typeof navItems)[number]["id"];
