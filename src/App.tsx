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
import { useAccount, useChainId, useConfig, useConnect, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
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
  const [lastClassifier, setLastClassifier] = useState<{ type: number; category: string; label: string } | null>(null);
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
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const account = address ?? null;
  const ritualConfigured = config.chains.some((chain) => chain.id === RITUAL_CHAIN_ID);
  const wrongNetwork = Boolean(account && chainId !== RITUAL_CHAIN_ID);
  const currentDisease = route.name === "disease" || route.name === "quiz" ? diseaseBySlug(route.slug) : diseases[0];
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

  const recordClassifier = () =>
    guardedWrite("classifier", async () => {
      if (!lastClassifier) throw new Error("Run a classifier first.");
      await sendConstualTransaction(account!, writeContractAsync, "recordClassifierUse", [
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
        switchNetwork={switchNetwork}
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
            A caring health companion for your learning journey.
          </motion.h1>
          <motion.p className="hero-subtitle" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
            Learn common health topics, use education-focused classifiers, ask a simulated bilingual agent, and build
            privacy-safe proof of learning.
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
  const [language, setLanguage] = useState(profile.preferredLanguage || 0);
  const copy = getClassifierCopy(language);
  const resultLabel = classifierResult ? getClassifierResultLabel(classifierResult.category, classifierResult.label, language) : copy.empty;

  return (
    <AppPage title="Constual Classifier" kicker={copy.kicker}>
      <div className="card classifier-card">
        <div className="language-toggle">
          <Languages size={18} />
          <button className={language === 0 ? "active" : ""} onClick={() => setLanguage(0)} type="button">Indonesia</button>
          <button className={language === 1 ? "active" : ""} onClick={() => setLanguage(1)} type="button">English</button>
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

        <div className="result-panel">
          <WellnessCharacter tone="blue" small />
          <div>
            <h3>{resultLabel}</h3>
            <p>{copy.disclaimer}</p>
          </div>
        </div>
        <div className="action-row">
          <button className="btn btn-dark" disabled={!classifierResult} onClick={() => setLastClassifier(classifierResult)} type="button">{copy.prepare}</button>
          <button className="btn btn-secondary" disabled={!lastClassifier || busy === "classifier"} onClick={recordClassifier} type="button">
            {busy === "classifier" ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
            {copy.record}
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
      <section className="about-grid extended">
        <AboutCard
          title="What is Constual?"
          copy="Constual is a bilingual health education dApp on Ritual Testnet. It helps users learn common health topics, use education-focused classifiers, ask a simulated bilingual health guidance agent, complete quizzes, and build privacy-safe proof-of-learning."
          icon={Leaf}
        />
        <AboutCard
          title="Why Constual?"
          copy="Many people need simple, friendly, bilingual health literacy tools before they can ask better questions and understand common disease topics. Constual turns learning into a calm, trackable experience."
          icon={Heart}
        />
        <AboutCard
          title="Built on Ritual Testnet"
          copy="Constual uses Ritual Testnet for learning passports, badges, leaderboard, classifier proof hashes, and agent guide proof hashes while keeping medical information out of the chain."
          icon={ShieldCheck}
        />
        <div className="card about-copy">
          <h2>What Constual is NOT</h2>
          <div className="not-grid">
            {["Not diagnosis", "Not doctor consultation", "Not a medical record app", "Not a personal diet plan", "Not emergency medical advice"].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
        <div className="card about-copy">
          <h2>Features</h2>
          <div className="not-grid">
            {["Constual Passport", "Disease Library", "Constual Classifier", "Constual Agent", "Quiz and Badge", "Leaderboard", "Proof of Learning"].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
        <div className="card about-copy">
          <h2>Privacy-safe design</h2>
          <p>
            Constual does not store raw blood pressure, blood sugar, height, weight, symptoms, diagnosis, medication, or
            medical history onchain. It only stores learning proof, category hash, agent guide hash, XP, badges, and
            progress.
          </p>
        </div>
        <div className="card about-copy creator-card">
          <h2>Created by Nxrskyaa</h2>
          <p>
            Indonesia-based Web3 content creator and builder exploring real-world blockchain applications for health
            literacy, education, and AI-assisted learning.
          </p>
          <div className="action-row">
            <a className="btn btn-secondary" href="https://github.com/nxrskyaa" rel="noreferrer" target="_blank">GitHub</a>
            <a className="btn btn-secondary" href="https://x.com/nxrskyaa" rel="noreferrer" target="_blank">X</a>
          </div>
        </div>
        <div className="card future-card">
          <HeroBuddyGroup compact />
          <h3>Future direction</h3>
          <p>Richer learning modules, more diseases, better simulated guidance, possible Ritual-native AI inference later, and community health education campaigns. V1 adds no LLM precompile, no backend, and no AI API.</p>
          <button className="btn btn-lime" onClick={() => navigate("/app")} type="button">Enter Constual</button>
        </div>
      </section>
    </AppPage>
  );
}

function AboutCard({ title, copy, icon: Icon }: { title: string; copy: string; icon: LucideIcon }) {
  return (
    <div className="card about-copy">
      <Icon size={28} />
      <h2>{title}</h2>
      <p>{copy}</p>
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
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  profile: Profile;
}) {
  const landing = route.name === "landing";
  const links = landing
    ? [
        { label: "Features", path: "#features" },
        { label: "Safety", path: "#safety" },
        { label: "About", path: "/about" },
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
          {!landing && wrongNetwork && (
            <button className="btn btn-warning" onClick={switchNetwork} type="button">
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

function DiseaseVisual({ diseaseId }: { diseaseId: number }) {
  const tone = (["lime", "blue", "orange", "purple", "pink"][(diseaseId - 1) % 5] ?? "lime") as CharacterTone;
  const Icon = diseases.find((disease) => disease.id === diseaseId)?.icon ?? Leaf;
  return (
    <div className="disease-visual">
      <WellnessCharacter tone={tone} />
      <div className="disease-icon-orbit">
        <Icon size={24} />
      </div>
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
  const enBase = [
    ["Definition", `${disease.name} basics`, disease.summary],
    ["Etiology", "Common causes", "Learn the usual causes and triggers so you can understand risk without self-diagnosing."],
    ["Risk Factors", "What can increase risk", "Age, environment, daily habits, family history, and exposure patterns can change risk depending on the topic."],
    ["Symptoms", "Signs to notice", "Symptoms are learning signals. They are not enough for diagnosis without qualified assessment."],
    ["Diagnosis basics", "How clinicians confirm", "Health workers combine history, examination, and appropriate tests rather than relying on one number or symptom."],
    ["Treatment basics", "Care is personal", "Treatment decisions belong with qualified professionals. Constual only teaches safe concepts."],
    ["Prevention", "Small habits help", "Prevention usually combines hygiene, sleep, movement, nutrition, environmental control, and screening where relevant."],
    ["Red flags", "Know when care is urgent", "Severe, sudden, persistent, or worsening symptoms should be checked promptly, especially breathing trouble, bleeding, confusion, or fainting."],
    ["Summary", "Ready for quiz", "Review the key ideas, then take the quiz to record privacy-safe proof-of-learning."],
  ];
  const idBase = [
    ["Pengertian", `Dasar ${disease.localName}`, disease.lesson],
    ["Etiologi", "Penyebab umum", "Pelajari penyebab dan pemicu umum agar kamu memahami risiko tanpa mendiagnosis diri sendiri."],
    ["Faktor Risiko", "Hal yang meningkatkan risiko", "Usia, lingkungan, kebiasaan, riwayat keluarga, dan pola paparan dapat memengaruhi risiko sesuai topik."],
    ["Gejala", "Tanda yang perlu diamati", "Gejala adalah sinyal pembelajaran, bukan dasar diagnosis tanpa pemeriksaan tenaga kesehatan."],
    ["Dasar Diagnosis", "Cara tenaga kesehatan memastikan", "Tenaga kesehatan menggabungkan riwayat, pemeriksaan, dan tes yang sesuai, bukan satu angka atau gejala saja."],
    ["Dasar Terapi", "Perawatan bersifat personal", "Keputusan terapi harus bersama tenaga kesehatan. Constual hanya mengajarkan konsep aman."],
    ["Pencegahan", "Kebiasaan kecil membantu", "Pencegahan biasanya menggabungkan kebersihan, tidur, gerak, nutrisi, kontrol lingkungan, dan skrining bila relevan."],
    ["Tanda Bahaya", "Kapan harus segera mencari bantuan", "Gejala berat, mendadak, menetap, atau memburuk perlu diperiksa segera, terutama sesak, perdarahan, bingung, atau pingsan."],
    ["Ringkasan", "Siap kuis", "Tinjau ide utama, lalu ikuti kuis untuk mencatat bukti belajar yang aman secara privasi."],
  ];
  return (language === 0 ? idBase : enBase).map(([label, title, copy]) => ({ label, title, copy }));
}

function getQuizQuestions(diseaseId: number, language: number): QuizCard[] {
  const disease = diseases.find((item) => item.id === diseaseId) ?? diseases[0];
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

function getClassifierCopy(language: number) {
  if (language === 0) {
    return {
      kicker: "Pemeriksa angka untuk edukasi",
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
      disclaimer: "Nilai mentah tetap di browser. Jika merekam proof, Constual hanya mengirim hash kategori ke Ritual Testnet.",
      prepare: "Siapkan Proof Classifier",
      record: "Rekam Proof Classifier",
    };
  }

  return {
    kicker: "Education-focused number checks",
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
    disclaimer: "Raw values stay in your browser. Recording proof sends only a category hash to Ritual Testnet.",
    prepare: "Prepare Classifier Proof",
    record: "Record Classifier Proof",
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
    if (lower.includes("user rejected")) return "Wallet confirmation was rejected.";
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
