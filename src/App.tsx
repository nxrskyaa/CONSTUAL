import { motion } from "framer-motion";
import {
  Activity,
  BadgeCheck,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  Languages,
  Loader2,
  Medal,
  MessageCircle,
  Network,
  ShieldAlert,
  Sparkles,
  UserRound,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getAddress, type Address } from "viem";
import { agentScenarios, diseases, languageLabels, navItems, type AgentScenario, type NavId } from "./data";
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
  completedQuests: bigint;
  claimedBadges: bigint;
  classifierUses: bigint;
  agentGuides: bigint;
};

type LeaderboardRow = Profile & {
  address: Address;
  accuracy: bigint;
};

type Toast = { kind: "success" | "error" | "info"; message: string } | null;
type ClassifierKind = "bp" | "sugar" | "bmi";

const safetyCopy = {
  id: "Constual hanya untuk edukasi. Fitur ini tidak memberikan diagnosis, keputusan pengobatan, rencana diet personal, atau saran medis darurat.",
  en: "Constual is for education only. It does not provide diagnosis, treatment decisions, personal diet plans, or emergency medical advice.",
};

const emptyProfile: Profile = {
  displayName: "",
  constualUsername: "",
  xUsername: "",
  preferredLanguage: 0,
  xp: 0n,
  completedQuests: 0n,
  claimedBadges: 0n,
  classifierUses: 0n,
  agentGuides: 0n,
};

function normalizeProfile(value: unknown): Profile {
  if (!Array.isArray(value)) return emptyProfile;
  return {
    displayName: String(value[0] ?? ""),
    constualUsername: String(value[1] ?? ""),
    xUsername: String(value[2] ?? ""),
    preferredLanguage: Number(value[3] ?? 0),
    xp: BigInt(String(value[4] ?? 0)),
    completedQuests: BigInt(String(value[5] ?? 0)),
    claimedBadges: BigInt(String(value[6] ?? 0)),
    classifierUses: BigInt(String(value[7] ?? 0)),
    agentGuides: BigInt(String(value[8] ?? 0)),
  };
}

function shortAddress(address?: Address | null) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected";
}

function avatarFor(profile: Pick<Profile, "xUsername" | "constualUsername" | "displayName">) {
  const seed = encodeURIComponent(profile.constualUsername || profile.displayName || "Constual");
  if (profile.xUsername) return `https://unavatar.io/x/${encodeURIComponent(profile.xUsername)}`;
  return `https://api.dicebear.com/9.x/initials/svg?seed=${seed}`;
}

function scoreLabel(score: bigint) {
  return `${Number(score).toLocaleString()} XP`;
}

function moduleName(id: number, language: number) {
  const disease = diseases.find((item) => item.id === id);
  return disease ? (language === 0 ? disease.localName : disease.name) : "Health Basics";
}

function App() {
  const [activeNav, setActiveNav] = useState<NavId>("passport");
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [profileCreated, setProfileCreated] = useState(false);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [form, setForm] = useState({ displayName: "", constualUsername: "", xUsername: "", preferredLanguage: 0 });
  const [selectedDiseaseId, setSelectedDiseaseId] = useState(1);
  const [selectedQuiz, setSelectedQuiz] = useState(0);
  const [completedMap, setCompletedMap] = useState<Record<number, boolean>>({});
  const [badgeMap, setBadgeMap] = useState<Record<number, boolean>>({});
  const [canBadgeMap, setCanBadgeMap] = useState<Record<number, boolean>>({});
  const [classifierKind, setClassifierKind] = useState<ClassifierKind>("bp");
  const [bp, setBp] = useState({ systolic: "", diastolic: "" });
  const [sugar, setSugar] = useState({ value: "", mode: "fasting" });
  const [bmi, setBmi] = useState({ height: "", weight: "" });
  const [lastClassifier, setLastClassifier] = useState<{ type: number; category: string; label: string } | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<AgentScenario>(agentScenarios[0]);
  const [agentLanguage, setAgentLanguage] = useState(0);
  const [agentReady, setAgentReady] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const wrongNetwork = Boolean(account && chainId !== RITUAL_CHAIN_ID);
  const selectedDisease = diseases.find((disease) => disease.id === selectedDiseaseId) ?? diseases[0];
  const preferredSafety = profile.preferredLanguage === 0 ? safetyCopy.id : safetyCopy.en;

  const showToast = useCallback((message: string, kind: NonNullable<Toast>["kind"] = "info") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 4200);
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

  const loadProfile = useCallback(async () => {
    if (!account) return;
    try {
      const created = (await publicClient.readContract({
        address: CONSTUAL_CORE_ADDRESS,
        abi: constualAbi,
        functionName: "isProfileCreated",
        args: [account],
      })) as boolean;
      setProfileCreated(created);

      if (!created) return;
      const rawProfile = await publicClient.readContract({
        address: CONSTUAL_CORE_ADDRESS,
        abi: constualAbi,
        functionName: "getProfile",
        args: [account],
      });
      const nextProfile = normalizeProfile(rawProfile);
      setProfile(nextProfile);
      setForm({
        displayName: nextProfile.displayName,
        constualUsername: nextProfile.constualUsername,
        xUsername: nextProfile.xUsername,
        preferredLanguage: nextProfile.preferredLanguage,
      });

      const progressEntries = await Promise.all(
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
      );

      setCompletedMap(Object.fromEntries(progressEntries.map(([id, completed]) => [id, completed])));
      setBadgeMap(Object.fromEntries(progressEntries.map(([id, , claimed]) => [id, claimed])));
      setCanBadgeMap(Object.fromEntries(progressEntries.map(([id, , , canClaim]) => [id, canClaim])));
    } catch (error) {
      console.error(error);
      showToast("Profile reads are unavailable. Check ABI, contract, or Ritual RPC.", "error");
    }
  }, [account, showToast]);

  const loadLeaderboard = useCallback(async () => {
    try {
      const count = (await publicClient.readContract({
        address: CONSTUAL_CORE_ADDRESS,
        abi: constualAbi,
        functionName: "getUserCount",
      })) as bigint;
      const limit = count > 30n ? 30n : count;
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
          return { ...normalizeProfile(rawProfile), accuracy: BigInt(String(accuracy ?? 0)), address };
        }),
      );

      setLeaderboard(rows.sort((a, b) => Number(b.xp - a.xp)));
    } catch (error) {
      console.error(error);
      setLeaderboard([]);
      showToast("Leaderboard could not be read from Ritual contract yet.", "error");
    }
  }, [showToast]);

  useEffect(() => {
    refreshWalletState();
    if (!window.ethereum) return;

    const handleAccounts = () => refreshWalletState();
    const handleChain = () => refreshWalletState();
    window.ethereum.on?.("accountsChanged", handleAccounts);
    window.ethereum.on?.("chainChanged", handleChain);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccounts);
      window.ethereum?.removeListener?.("chainChanged", handleChain);
    };
  }, [refreshWalletState]);

  useEffect(() => {
    if (account) {
      loadProfile();
      loadLeaderboard();
    }
  }, [account, loadLeaderboard, loadProfile]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      showToast("Install a browser wallet to connect.", "error");
      return;
    }
    const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
    setAccount(accounts[0] ? getAddress(accounts[0]) : null);
    await refreshWalletState();
  };

  const guardedWrite = async (label: string, action: () => Promise<void>) => {
    if (!account) {
      showToast("Connect your wallet first.", "error");
      return;
    }
    if (wrongNetwork) {
      showToast("Please switch to Ritual Testnet.", "error");
      return;
    }
    setBusy(label);
    try {
      await action();
      await loadProfile();
      await loadLeaderboard();
      showToast("Constual Learning Proof updated on Ritual Testnet.", "success");
    } catch (error) {
      console.error(error);
      showToast("Transaction failed or was rejected.", "error");
    } finally {
      setBusy(null);
    }
  };

  const submitProfile = () =>
    guardedWrite("profile", async () => {
      const args = [
        form.displayName.trim(),
        form.constualUsername.trim().toLowerCase(),
        form.xUsername.trim().replace(/^@/, ""),
        form.preferredLanguage,
      ] as const;
      await sendConstualTransaction(account!, profileCreated ? "updateProfile" : "createProfile", args);
    });

  const completeQuest = () =>
    guardedWrite("quest", async () => {
      const score = selectedQuiz === selectedDisease.quiz.answer ? 100n : 60n;
      await sendConstualTransaction(account!, "completeQuest", [
        BigInt(selectedDisease.id),
        score,
        form.preferredLanguage,
      ]);
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
      if (!lastClassifier) return;
      await sendConstualTransaction(account!, "recordClassifierUse", [
        lastClassifier.type,
        categoryHash(lastClassifier.category),
        form.preferredLanguage,
      ]);
    });

  const generateAgent = (scenario: AgentScenario) => {
    setSelectedScenario(scenario);
    setAgentReady(false);
    window.setTimeout(() => setAgentReady(true), 850);
  };

  const recordAgentGuide = () =>
    guardedWrite("agent", async () => {
      await sendConstualTransaction(account!, "recordAgentGuide", [
        BigInt(selectedScenario.id),
        agentLanguage,
        guideProofHash(selectedScenario.id, agentLanguage, account!),
      ]);
    });

  return (
    <main>
      <section className="hero">
        <nav className="topbar">
          <button className="brand" onClick={() => setActiveNav("passport")} type="button" aria-label="Constual home">
            <span className="brand-mark">C</span>
            <span>
              <strong>Constual</strong>
              <small>Ritual Testnet</small>
            </span>
          </button>
          <div className="wallet-group">
            {wrongNetwork && (
              <button className="network-warning" onClick={switchToRitualTestnet} type="button">
                <Network size={16} />
                Switch to Ritual Testnet
              </button>
            )}
            <button className="wallet-button" onClick={connectWallet} type="button">
              <Wallet size={17} />
              {account ? shortAddress(account) : "Connect wallet"}
            </button>
          </div>
        </nav>

        <div className="hero-grid">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <h1>Constual Learning Passport</h1>
            <p>
              Bilingual health education on Ritual Testnet with modules, classifiers, simulated agent guidance, badges,
              leaderboard, and privacy-safe proof-of-learning.
            </p>
            <div className="hero-actions">
              <button className="primary" onClick={() => setActiveNav("passport")} type="button">
                Open Passport
                <ChevronRight size={18} />
              </button>
              <button className="secondary" onClick={() => setActiveNav("agent")} type="button">
                Try Constual Agent
                <Bot size={18} />
              </button>
            </div>
          </motion.div>
          <motion.div className="proof-panel" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.12 }}>
            <div className="proof-orbit">
              <div className="pulse-card">
                <HeartStat label="Modules" value="5" />
                <HeartStat label="Agent Topics" value="25" />
                <HeartStat label="Chain" value="1979" />
              </div>
            </div>
            <div className="contract-pill">
              <ShieldAlert size={16} />
              {CONSTUAL_CORE_ADDRESS}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="app-shell">
        <aside className="rail">
          {navItems.map((item) => (
            <button
              className={activeNav === item.id ? "rail-item active" : "rail-item"}
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              type="button"
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </aside>

        <div className="content">
          {wrongNetwork && (
            <div className="gate">
              <ShieldAlert />
              <div>
                <strong>Please switch to Ritual Testnet.</strong>
                <span>Write transactions are disabled until your wallet is on chain ID 1979.</span>
              </div>
              <button className="primary small" onClick={switchToRitualTestnet} type="button">
                Switch to Ritual Testnet
              </button>
            </div>
          )}

          {activeNav === "passport" && (
            <Panel title="Constual Passport" icon={UserRound}>
              <div className="passport-grid">
                <div className="profile-card">
                  <img src={avatarFor(profileCreated ? profile : form)} alt="Constual Passport avatar" />
                  <div>
                    <h3>{profileCreated ? profile.displayName : "Create your passport"}</h3>
                    <p>@{profileCreated ? profile.constualUsername : "constual"}</p>
                    <span>{languageLabels[profileCreated ? profile.preferredLanguage : form.preferredLanguage]}</span>
                  </div>
                </div>
                <div className="stats-row">
                  <Stat label="XP" value={scoreLabel(profile.xp)} />
                  <Stat label="Badges" value={profile.claimedBadges.toString()} />
                  <Stat label="Classifier Proofs" value={profile.classifierUses.toString()} />
                  <Stat label="Agent Proofs" value={profile.agentGuides.toString()} />
                </div>
              </div>

              <div className="form-grid">
                <Field label="Display Name" value={form.displayName} onChange={(value) => setForm({ ...form, displayName: value })} />
                <Field label="Constual Username" value={form.constualUsername} onChange={(value) => setForm({ ...form, constualUsername: value })} />
                <Field label="X Username without @" value={form.xUsername} onChange={(value) => setForm({ ...form, xUsername: value.replace(/^@/, "") })} />
                <label className="field">
                  <span>Preferred Language</span>
                  <select value={form.preferredLanguage} onChange={(event) => setForm({ ...form, preferredLanguage: Number(event.target.value) })}>
                    <option value={0}>Indonesia</option>
                    <option value={1}>English</option>
                  </select>
                </label>
              </div>
              <button className="primary" onClick={submitProfile} disabled={busy === "profile" || wrongNetwork} type="button">
                {busy === "profile" ? <Loader2 className="spin" size={18} /> : <BadgeCheck size={18} />}
                {profileCreated ? "Update Constual Passport" : "Create Constual Passport"}
              </button>
              <p className="safety">{preferredSafety}</p>
            </Panel>
          )}

          {activeNav === "learn" && (
            <Panel title="Disease Library" icon={BookOpen}>
              <div className="library-grid">
                {diseases.map((disease) => (
                  <button
                    className={selectedDiseaseId === disease.id ? "disease-card selected" : "disease-card"}
                    key={disease.id}
                    onClick={() => setSelectedDiseaseId(disease.id)}
                    type="button"
                  >
                    <disease.icon size={22} />
                    <span>{form.preferredLanguage === 0 ? disease.localName : disease.name}</span>
                    <small>{completedMap[disease.id] ? "Quest complete" : disease.summary}</small>
                  </button>
                ))}
              </div>

              <div className="lesson-card">
                <div>
                  <h3>{form.preferredLanguage === 0 ? selectedDisease.localName : selectedDisease.name}</h3>
                  <p>{selectedDisease.lesson}</p>
                </div>
                <div className="quiz-box">
                  <strong>Quiz</strong>
                  <p>{selectedDisease.quiz.question}</p>
                  {selectedDisease.quiz.options.map((option, index) => (
                    <label className="choice" key={option}>
                      <input
                        checked={selectedQuiz === index}
                        name="quiz"
                        onChange={() => setSelectedQuiz(index)}
                        type="radio"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </div>

              <div className="action-row">
                <button className="primary" onClick={completeQuest} disabled={busy === "quest" || wrongNetwork} type="button">
                  {busy === "quest" ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
                  Complete Quest
                </button>
                <button
                  className="secondary"
                  onClick={() => claimBadge(selectedDisease.id)}
                  disabled={busy === "badge" || !canBadgeMap[selectedDisease.id] || badgeMap[selectedDisease.id] || wrongNetwork}
                  type="button"
                >
                  <Medal size={18} />
                  {badgeMap[selectedDisease.id] ? "Badge Claimed" : "Claim Badge"}
                </button>
              </div>
            </Panel>
          )}

          {activeNav === "classifier" && (
            <Panel title="Constual Classifier" icon={Activity}>
              <div className="segmented">
                {[
                  ["bp", "Blood Pressure / Tensi"],
                  ["sugar", "Blood Sugar / Gula Darah"],
                  ["bmi", "BMI"],
                ].map(([id, label]) => (
                  <button
                    className={classifierKind === id ? "active" : ""}
                    key={id}
                    onClick={() => setClassifierKind(id as ClassifierKind)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
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

              <div className="result-card">
                <Sparkles />
                <div>
                  <h3>{classifierResult?.label ?? "Enter values to see education category"}</h3>
                  <p>
                    Raw values stay in your browser. If you record proof, Constual sends only a category hash to Ritual
                    Testnet.
                  </p>
                </div>
              </div>
              <div className="action-row">
                <button
                  className="primary"
                  disabled={!classifierResult}
                  onClick={() => classifierResult && setLastClassifier(classifierResult)}
                  type="button"
                >
                  Prepare Classifier Proof
                </button>
                <button className="secondary" disabled={!lastClassifier || busy === "classifier" || wrongNetwork} onClick={recordClassifier} type="button">
                  {busy === "classifier" ? <Loader2 className="spin" size={18} /> : <ShieldAlert size={18} />}
                  Record Classifier Proof
                </button>
              </div>
            </Panel>
          )}

          {activeNav === "agent" && (
            <Panel title="Constual Agent" icon={Bot}>
              <div className="agent-grid">
                <div className="scenario-list">
                  {agentScenarios.map((scenario) => (
                    <button key={scenario.id} onClick={() => generateAgent(scenario)} type="button">
                      <span>{scenario.id}</span>
                      {scenario.title}
                    </button>
                  ))}
                </div>
                <div className="chat-card">
                  <div className="language-toggle">
                    <Languages size={17} />
                    <button className={agentLanguage === 0 ? "active" : ""} onClick={() => setAgentLanguage(0)} type="button">
                      Indonesia
                    </button>
                    <button className={agentLanguage === 1 ? "active" : ""} onClick={() => setAgentLanguage(1)} type="button">
                      English
                    </button>
                  </div>
                  <div className="user-bubble">
                    <MessageCircle size={16} />
                    {agentLanguage === 0 ? selectedScenario.user.id : selectedScenario.user.en}
                  </div>
                  {!agentReady ? (
                    <div className="typing">
                      <span />
                      <span />
                      <span />
                      Constual Agent is typing
                    </div>
                  ) : (
                    <AgentReport scenario={selectedScenario} language={agentLanguage} />
                  )}
                  <div className="module-buttons">
                    {selectedScenario.diseaseIds.length ? (
                      selectedScenario.diseaseIds.map((id) => (
                        <button key={id} onClick={() => { setSelectedDiseaseId(id); setActiveNav("learn"); }} type="button">
                          {moduleName(id, agentLanguage)}
                        </button>
                      ))
                    ) : (
                      <button onClick={() => setActiveNav("classifier")} type="button">Open Constual Classifier</button>
                    )}
                  </div>
                  <button className="primary" disabled={!agentReady || busy === "agent" || wrongNetwork} onClick={recordAgentGuide} type="button">
                    {busy === "agent" ? <Loader2 className="spin" size={18} /> : <ShieldAlert size={18} />}
                    Record Agent Guide Proof
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {activeNav === "leaderboard" && (
            <Panel title="Leaderboard" icon={Medal}>
              <div className="leaderboard">
                {(leaderboard.length ? leaderboard : []).map((row, index) => (
                  <div className="leader-row" key={row.address}>
                    <span className="rank">{index + 1}</span>
                    <img src={avatarFor(row)} alt="" />
                    <div>
                      <strong>{row.displayName || shortAddress(row.address)}</strong>
                      <small>@{row.constualUsername || "constual"} - {shortAddress(row.address)}</small>
                    </div>
                    <span>{scoreLabel(row.xp)}</span>
                  </div>
                ))}
                {!leaderboard.length && (
                  <div className="empty-state">
                    <Medal />
                    <h3>No leaderboard rows yet</h3>
                    <p>Create a Constual Passport and complete quests to appear here.</p>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>
      </section>

      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
    </main>
  );
}

function HeartStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof BadgeCheck; children: ReactNode }) {
  return (
    <motion.section className="panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className="panel-title">
        <Icon size={22} />
        <h2>{title}</h2>
      </div>
      {children}
    </motion.section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} type={type} />
    </label>
  );
}

function AgentReport({ scenario, language }: { scenario: AgentScenario; language: number }) {
  const answer = language === 0 ? scenario.report.id : scenario.report.en;
  return (
    <motion.div className="agent-report" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <ReportLine label="Explanation" value={answer.explanation} />
      <ReportLine label="Learning meaning" value={answer.meaning} />
      <ReportLine label="Food guidance" value={answer.food} />
      <ReportLine label="Lifestyle guidance" value={answer.lifestyle} />
      <ReportLine label="Safety reminder" value={answer.safety} />
    </motion.div>
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

export default App;
