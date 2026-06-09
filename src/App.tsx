import { motion } from "framer-motion";
import {
  Activity,
  BadgeCheck,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  Droplets,
  Heart,
  Home,
  Languages,
  Leaf,
  Loader2,
  Menu,
  Moon,
  Network,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getAddress, type Address } from "viem";
import { agentScenarios, diseases, languageLabels, type AgentScenario, type Disease } from "./data";
import {
  categoryHash,
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
  | { name: "library" }
  | { name: "disease"; slug: string }
  | { name: "quiz"; slug: string }
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
  { label: "Library", path: "/library", icon: BookOpen },
  { label: "Classifier", path: "/classifier", icon: Activity },
  { label: "Agent", path: "/agent", icon: Bot },
  { label: "Passport", path: "/passport", icon: UserRound },
  { label: "Leaderboard", path: "/leaderboard", icon: Trophy },
  { label: "About", path: "/about", icon: ShieldCheck },
] as const;

const featureCards = [
  { title: "Constual Passport", copy: "A privacy-safe learning identity for modules, badges, and proof activity.", path: "/passport", icon: UserRound, buddy: "lime" },
  { title: "Disease Library", copy: "Short bilingual modules for common health topics without long walls of text.", path: "/library", icon: BookOpen, buddy: "blue" },
  { title: "Constual Classifier", copy: "Education-focused checks for blood pressure, blood sugar, and BMI categories.", path: "/classifier", icon: Activity, buddy: "orange" },
  { title: "Constual Agent", copy: "A simulated bilingual guide with preset wellness scenarios. No API, no backend.", path: "/agent", icon: Bot, buddy: "purple" },
  { title: "Learning Badge", copy: "Complete quiz flows, then claim badges from ConstualCore on Ritual Testnet.", path: "/library", icon: BadgeCheck, buddy: "pink" },
  { title: "Leaderboard", copy: "Read Ritual Testnet progress and sort XP client-side.", path: "/leaderboard", icon: Trophy, buddy: "lime" },
] as const;

function App() {
  const [route, setRoute] = useState<RouteInfo>(() => parseRoute(window.location.pathname));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
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
  const [selectedQuiz, setSelectedQuiz] = useState(0);
  const [classifierKind, setClassifierKind] = useState<ClassifierKind>("bp");
  const [bp, setBp] = useState({ systolic: "", diastolic: "" });
  const [sugar, setSugar] = useState({ value: "", mode: "fasting" });
  const [bmi, setBmi] = useState({ height: "", weight: "" });
  const [lastClassifier, setLastClassifier] = useState<{ type: number; category: string; label: string } | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<AgentScenario>(agentScenarios[0]);
  const [agentLanguage, setAgentLanguage] = useState(0);
  const [agentReady, setAgentReady] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState("");

  const wrongNetwork = Boolean(account && chainId !== RITUAL_CHAIN_ID);
  const currentDisease = route.name === "disease" || route.name === "quiz" ? diseaseBySlug(route.slug) : diseases[0];

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

  const refreshWalletState = useCallback(async () => {
    if (!window.ethereum) return;
    const [accounts, chain] = await Promise.all([
      window.ethereum.request({ method: "eth_accounts" }) as Promise<string[]>,
      window.ethereum.request({ method: "eth_chainId" }) as Promise<string>,
    ]);
    setAccount(accounts[0] ? getAddress(accounts[0]) : null);
    setChainId(Number.parseInt(chain, 16));
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      showToast("Install a browser wallet to connect.", "error");
      return;
    }

    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      setAccount(accounts[0] ? getAddress(accounts[0]) : null);
      await refreshWalletState();
    } catch (error) {
      console.error(error);
      showToast("Wallet connection was cancelled.", "error");
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
      setProfileError("Constual Passport could not be read. Please retry after checking wallet, ABI, and Ritual RPC.");
      showToast("Passport read failed. Try the retry button.", "error");
    }
  }, [account, showToast]);

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
    refreshWalletState();
    if (!window.ethereum) return;
    const refresh = () => refreshWalletState();
    window.ethereum.on?.("accountsChanged", refresh);
    window.ethereum.on?.("chainChanged", refresh);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", refresh);
      window.ethereum?.removeListener?.("chainChanged", refresh);
    };
  }, [refreshWalletState]);

  useEffect(() => {
    if (account) {
      loadProfile();
    }
  }, [account, loadProfile]);

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

    setBusy(label);
    try {
      showToast("Confirm the transaction in your wallet.", "info");
      await action();
      showToast("Transaction confirmed. Refreshing Constual reads.", "success");
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

        await sendConstualTransaction(account!, profileCreated ? "updateProfile" : "createProfile", [
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

  const completeQuest = (disease: Disease) =>
    guardedWrite("quest", async () => {
      const score = selectedQuiz === disease.quiz.answer ? 100n : 60n;
      await sendConstualTransaction(account!, "completeQuest", [BigInt(disease.id), score, profile.preferredLanguage]);
    });

  const claimBadge = (diseaseId: number) =>
    guardedWrite("badge", async () => {
      await sendConstualTransaction(account!, "claimBadge", [BigInt(diseaseId)]);
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

  const recordClassifier = () =>
    guardedWrite("classifier", async () => {
      if (!lastClassifier) throw new Error("Run a classifier first.");
      await sendConstualTransaction(account!, "recordClassifierUse", [
        lastClassifier.type,
        categoryHash(lastClassifier.category),
        profile.preferredLanguage,
      ]);
    });

  const generateAgent = (scenario: AgentScenario) => {
    setSelectedScenario(scenario);
    setAgentReady(false);
    window.setTimeout(() => setAgentReady(true), 760);
  };

  const recordAgentGuide = () =>
    guardedWrite("agent", async () => {
      await sendConstualTransaction(account!, "recordAgentGuide", [
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
    selectedQuiz,
    setSelectedQuiz,
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
    lastClassifier,
    setLastClassifier,
    recordClassifier,
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
  });

  return (
    <main className={route.name === "landing" ? "site landing-mode" : "site app-mode"}>
      <Navbar
        route={route}
        navigate={navigate}
        account={account}
        connectWallet={connectWallet}
        wrongNetwork={wrongNetwork}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        profile={profile}
      />
      {route.name !== "landing" && wrongNetwork && <NetworkGate />}
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
  selectedQuiz: number;
  setSelectedQuiz: (index: number) => void;
  completeQuest: (disease: Disease) => void;
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
  lastClassifier: { type: number; category: string; label: string } | null;
  setLastClassifier: (value: { type: number; category: string; label: string } | null) => void;
  recordClassifier: () => void;
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
};

function renderRoute(props: RenderProps) {
  switch (props.route.name) {
    case "landing":
      return <LandingPage navigate={props.navigate} />;
    case "app":
      return <DashboardPage {...props} />;
    case "library":
      return <LibraryPage navigate={props.navigate} completedMap={props.completedMap} badgeMap={props.badgeMap} />;
    case "disease":
      return <DiseasePage disease={props.currentDisease} navigate={props.navigate} completed={props.completedMap[props.currentDisease.id]} />;
    case "quiz":
      return <QuizPage {...props} disease={props.currentDisease} />;
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
            Your caring health companion for every step of your wellness journey.
          </motion.h1>
          <motion.p className="hero-subtitle" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
            Constual helps you learn common health topics, check health education numbers, ask a simulated bilingual
            agent, and build privacy-safe proof of learning on Ritual Testnet.
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

      <LandingSection id="how" title="How Constual Works" copy="A calm learning flow for health education and onchain proof-of-learning.">
        <div className="steps-grid">
          {["Learn", "Check", "Ask Agent", "Quiz", "Earn Proof"].map((step, index) => (
            <div className="step-card" key={step}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
      </LandingSection>

      <LandingSection id="features" title="Feature Highlights" copy="Everything in Constual is education-first, frontend-only, and designed to avoid storing medical records.">
        <FeatureGrid navigate={navigate} />
      </LandingSection>

      <LandingSection title="Why Ritual Testnet" copy="Built on Ritual Testnet for privacy-safe learning proofs and future AI-native health education experiences.">
        <div className="ritual-panel">
          <div>
            <p>Network</p>
            <strong>Ritual Testnet</strong>
          </div>
          <div>
            <p>Chain ID</p>
            <strong>1979</strong>
          </div>
          <div>
            <p>Proof model</p>
            <strong>Learning only</strong>
          </div>
        </div>
      </LandingSection>

      <LandingSection id="safety" title="Safety by Design" copy={safetyCopy}>
        <div className="safety-band">
          <ShieldCheck />
          <p>Constual does not store diagnosis, treatment decisions, personal diet plans, emergency advice, or medical records.</p>
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
            <WellnessCharacter tone={["lime", "blue", "orange", "purple", "pink"][index] as CharacterTone} small />
            <span>{disease.localName}</span>
            <h3>{disease.name}</h3>
            <p>{disease.summary}</p>
            <div className="status-row">
              <small>{completedMap[disease.id] ? "Quest complete" : "Ready to learn"}</small>
              <small>{badgeMap[disease.id] ? "Badge claimed" : "Badge available after quiz"}</small>
            </div>
          </motion.button>
        ))}
      </div>
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
  return (
    <AppPage title={disease.name} kicker={disease.localName} action={<button className="btn btn-lime" onClick={() => navigate(`/disease/${slugForDisease(disease)}/quiz`)} type="button">Take Quiz</button>}>
      <section className="learning-layout">
        <div className="card learning-main">
          <disease.icon size={34} />
          <h2>{disease.lesson}</h2>
          <p>{disease.summary}</p>
          <div className="lesson-points">
            <InfoPill title="Meaning" copy="Learn the category and context before taking action." />
            <InfoPill title="Care habit" copy="Track patterns, discuss concerns with qualified professionals, and avoid self-diagnosis." />
            <InfoPill title="Safety" copy={safetyCopy} />
          </div>
        </div>
        <aside className="card side-card">
          <WellnessCharacter tone="lime" />
          <h3>{completed ? "Quest completed" : "Ready for quiz"}</h3>
          <p>Complete the quiz to record learning progress, then claim a badge when the contract allows it.</p>
          <button className="btn btn-dark" onClick={() => navigate(`/disease/${slugForDisease(disease)}/quiz`)} type="button">Open Quiz</button>
        </aside>
      </section>
    </AppPage>
  );
}

function QuizPage({
  disease,
  selectedQuiz,
  setSelectedQuiz,
  completeQuest,
  claimBadge,
  busy,
  completedMap,
  badgeMap,
  canBadgeMap,
}: RenderProps & { disease: Disease }) {
  return (
    <AppPage title={`${disease.name} Quiz`} kicker="Constual Learning Proof">
      <section className="card quiz-card">
        <div>
          <p className="eyebrow">{disease.localName}</p>
          <h2>{disease.quiz.question}</h2>
        </div>
        <div className="choice-list">
          {disease.quiz.options.map((option, index) => (
            <label className={selectedQuiz === index ? "choice active" : "choice"} key={option}>
              <input checked={selectedQuiz === index} name="quiz" onChange={() => setSelectedQuiz(index)} type="radio" />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <div className="action-row">
          <button className="btn btn-lime" onClick={() => completeQuest(disease)} disabled={busy === "quest"} type="button">
            {busy === "quest" ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            Complete Quest
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
  classifierKind,
  setClassifierKind,
  bp,
  setBp,
  sugar,
  setSugar,
  bmi,
  setBmi,
  classifierResult,
  setLastClassifier,
  lastClassifier,
  recordClassifier,
  busy,
}: RenderProps) {
  return (
    <AppPage title="Constual Classifier" kicker="Education-focused number checks">
      <div className="card classifier-card">
        <div className="segmented">
          <button className={classifierKind === "bp" ? "active" : ""} onClick={() => setClassifierKind("bp")} type="button">Cek Tensi</button>
          <button className={classifierKind === "sugar" ? "active" : ""} onClick={() => setClassifierKind("sugar")} type="button">Gula Darah</button>
          <button className={classifierKind === "bmi" ? "active" : ""} onClick={() => setClassifierKind("bmi")} type="button">BMI</button>
        </div>

        {classifierKind === "bp" && (
          <div className="form-grid">
            <Field label="Systolic" value={bp.systolic} onChange={(value) => setBp({ ...bp, systolic: value })} type="number" />
            <Field label="Diastolic" value={bp.diastolic} onChange={(value) => setBp({ ...bp, diastolic: value })} type="number" />
          </div>
        )}
        {classifierKind === "sugar" && (
          <div className="form-grid">
            <Field label="Blood sugar value" value={sugar.value} onChange={(value) => setSugar({ ...sugar, value })} type="number" />
            <label className="field">
              <span>Reading type</span>
              <select value={sugar.mode} onChange={(event) => setSugar({ ...sugar, mode: event.target.value })}>
                <option value="fasting">Fasting</option>
                <option value="random">Random</option>
              </select>
            </label>
          </div>
        )}
        {classifierKind === "bmi" && (
          <div className="form-grid">
            <Field label="Height in cm" value={bmi.height} onChange={(value) => setBmi({ ...bmi, height: value })} type="number" />
            <Field label="Weight in kg" value={bmi.weight} onChange={(value) => setBmi({ ...bmi, weight: value })} type="number" />
          </div>
        )}

        <div className="result-panel">
          <WellnessCharacter tone="blue" small />
          <div>
            <h3>{classifierResult?.label ?? "Enter values to see education category"}</h3>
            <p>Raw values stay in your browser. Recording proof sends only a category hash to Ritual Testnet.</p>
          </div>
        </div>
        <div className="action-row">
          <button className="btn btn-dark" disabled={!classifierResult} onClick={() => setLastClassifier(classifierResult)} type="button">Prepare Classifier Proof</button>
          <button className="btn btn-secondary" disabled={!lastClassifier || busy === "classifier"} onClick={recordClassifier} type="button">
            {busy === "classifier" ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
            Record Classifier Proof
          </button>
        </div>
      </div>
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
    <AppPage title="Constual Agent" kicker="Simulated bilingual guidance">
      <section className="agent-layout">
        <aside className="card scenario-list">
          {agentScenarios.map((scenario) => (
            <button key={scenario.id} onClick={() => generateAgent(scenario)} type="button">
              <span>{scenario.id}</span>
              {scenario.title}
            </button>
          ))}
        </aside>
        <div className="card chat-panel">
          <div className="language-toggle">
            <Languages size={18} />
            <button className={agentLanguage === 0 ? "active" : ""} onClick={() => setAgentLanguage(0)} type="button">Indonesia</button>
            <button className={agentLanguage === 1 ? "active" : ""} onClick={() => setAgentLanguage(1)} type="button">English</button>
          </div>
          <div className="user-bubble">{agentLanguage === 0 ? selectedAgentScenario.user.id : selectedAgentScenario.user.en}</div>
          {!agentReady ? (
            <div className="typing"><span /><span /><span /> Constual Agent is typing</div>
          ) : (
            <motion.div className="agent-report" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <ReportLine label="Explanation" value={answer.explanation} />
              <ReportLine label="Learning meaning" value={answer.meaning} />
              <ReportLine label="Food guidance" value={answer.food} />
              <ReportLine label="Lifestyle guidance" value={answer.lifestyle} />
              <ReportLine label="Safety reminder" value={answer.safety} />
            </motion.div>
          )}
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
          <button className="btn btn-lime" disabled={!agentReady || busy === "agent"} onClick={recordAgentGuide} type="button">
            {busy === "agent" ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
            Record Agent Guide Proof
          </button>
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
  return (
    <AppPage title="About Constual" kicker="Caring, modern, trusted, calm">
      <section className="about-grid">
        <div className="card about-copy">
          <h2>Constual is a bilingual health education dApp on Ritual Testnet.</h2>
          <p>
            It helps users learn common health topics, use education-focused classifiers, ask a simulated bilingual
            health guidance agent, complete quizzes, and build privacy-safe proof-of-learning.
          </p>
          <p>
            Constual is not a diagnosis app, not a doctor consultation app, and not a medical record app. It stores
            learning progress only.
          </p>
          <p>
            Built on Ritual Testnet, Constual explores how real-world health literacy experiences can connect with
            blockchain-based learning identity and proof systems.
          </p>
          <button className="btn btn-lime" onClick={() => navigate("/app")} type="button">Enter Constual</button>
        </div>
        <div className="card future-card">
          <HeroBuddyGroup compact />
          <h3>Future-ready, V1-safe</h3>
          <p>Constual is ready for Ritual-native AI exploration later, but V1 adds no LLM precompile, no backend, and no AI API.</p>
        </div>
      </section>
    </AppPage>
  );
}

function Navbar({
  route,
  navigate,
  account,
  connectWallet,
  wrongNetwork,
  mobileMenuOpen,
  setMobileMenuOpen,
  profile,
}: {
  route: RouteInfo;
  navigate: (path: string) => void;
  account: Address | null;
  connectWallet: () => void;
  wrongNetwork: boolean;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  profile: Profile;
}) {
  const landing = route.name === "landing";
  const links = landing
    ? [
        { label: "Features", path: "#features" },
        { label: "Safety", path: "#safety" },
        { label: "Enter Constual", path: "/app" },
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

  return (
    <header className="navbar-wrap">
      <nav className="navbar">
        <button className="logo-button" onClick={() => navigate(landing ? "/" : "/app")} type="button" aria-label="Constual home">
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
          {!landing && wrongNetwork && (
            <button className="btn btn-warning" onClick={switchToRitualTestnet} type="button">
              <Network size={16} />
              Switch
            </button>
          )}
          {!landing && (
            <button className="btn btn-secondary wallet-btn" onClick={connectWallet} type="button">
              <Wallet size={17} />
              {account ? shortAddress(account) : "Connect wallet"}
            </button>
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
            <button onClick={connectWallet} type="button">{account ? `${profile.constualUsername || shortAddress(account)}` : "Connect wallet"}</button>
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
    <section className="landing-section" id={id}>
      <div className="section-heading">
        <p className="eyebrow">Constual</p>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      {children}
    </section>
  );
}

function FeatureGrid({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="feature-grid">
      {featureCards.map((feature) => (
        <button className="card feature-card" key={feature.title} onClick={() => navigate(feature.path)} type="button">
          <WellnessCharacter tone={feature.buddy as CharacterTone} small />
          <feature.icon size={23} />
          <h3>{feature.title}</h3>
          <p>{feature.copy}</p>
        </button>
      ))}
    </div>
  );
}

function NetworkGate() {
  return (
    <div className="network-gate">
      <ShieldCheck />
      <div>
        <strong>Please switch to Ritual Testnet.</strong>
        <span>Write transactions are disabled until your wallet is on chain ID 1979.</span>
      </div>
      <button className="btn btn-lime" onClick={switchToRitualTestnet} type="button">Switch to Ritual Testnet</button>
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
      <WellnessCharacter tone="purple" className="buddy b4" />
      <WellnessCharacter tone="pink" className="buddy b5" />
      <FloatingHealthCard label="Learning Badge" className="float-card f1" />
      <FloatingHealthCard label="Ritual Proof" className="float-card f2" />
    </motion.div>
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

function FloatingHealthCard({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`floating-health-card ${className}`}>
      <Sparkles size={15} />
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
  if (path === "/library") return { name: "library" };
  if (path === "/classifier") return { name: "classifier" };
  if (path === "/agent") return { name: "agent" };
  if (path === "/passport") return { name: "passport" };
  if (path === "/leaderboard") return { name: "leaderboard" };
  if (path === "/about") return { name: "about" };
  const quiz = path.match(/^\/disease\/([^/]+)\/quiz$/);
  if (quiz) return { name: "quiz", slug: quiz[1] };
  const disease = path.match(/^\/disease\/([^/]+)$/);
  if (disease) return { name: "disease", slug: disease[1] };
  return { name: "app" };
}

function isActiveRoute(route: RouteInfo, path: string) {
  if (path === "/app") return route.name === "app";
  if (path === "/library") return route.name === "library" || route.name === "disease" || route.name === "quiz";
  return parseRoute(path).name === route.name;
}

function slugForDisease(disease: Disease) {
  return disease.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function diseaseBySlug(slug: string) {
  return diseases.find((disease) => slugForDisease(disease) === slug) ?? diseases[0];
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
  if (error instanceof Error && error.message.includes("not available")) return error.message;
  if (error instanceof Error && error.message.toLowerCase().includes("user rejected")) return "Wallet confirmation was rejected.";
  return "Transaction failed. Please check wallet, network, and contract state.";
}

function shortAddress(address?: Address | null) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected";
}

function formatBigint(value: bigint) {
  return Number(value).toLocaleString();
}

export default App;
