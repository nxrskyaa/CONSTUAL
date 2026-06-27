import Phaser from "phaser";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { publicClient, RITUAL_CHAIN_ID, switchToRitualTestnet } from "../web3";
import { useConstualGame } from "../hooks/useConstualGame";
import "./game.css";
import { gameBridge, type DialogPayload, type NotifyPayload, type XpPayload } from "./bridge";
import { getZone, passThreshold, scoreFromQuiz, zones } from "./data/zones";
import { QUEST_TEACHER_NAMES } from "./data/npcs";
import { PLAYER_KEY, PLAYABLE_CHARACTERS, portraitPath } from "./config/sprites";
import MainWorldScene from "./scenes/MainWorldScene";
import PreloadScene from "./scenes/PreloadScene";
import { MusicSystem } from "./systems/MusicSystem";

type Toast = { id: number; kind: NotifyPayload["kind"]; message: string };
type QuizState = { zoneId: number; answers: number[] };
type ResultState = { passed: boolean; correct: number; total: number; score: number } | null;

let toastSeq = 0;

export default function GameCanvas({ onExit }: { onExit?: () => void }) {
  const game = useConstualGame();
  const { account, isConnected, isCorrectChain, profileCreated, profile, isWriting } = game;
  const { connectors, connectAsync } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();

  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const musicRef = useRef<MusicSystem | null>(null);
  const [muted, setMuted] = useState(false);

  const [dialog, setDialog] = useState<DialogPayload | null>(null);
  const [lineIndex, setLineIndex] = useState(0);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [result, setResult] = useState<ResultState>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [xp, setXp] = useState<XpPayload | null>(null);
  const [displayedText, setDisplayedText] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [playerKey, setPlayerKey] = useState(() => {
    if (typeof window === "undefined") return PLAYER_KEY;
    const saved = window.localStorage.getItem("constual-player-key");
    return saved && PLAYABLE_CHARACTERS.some((c) => c.key === saved) ? saved : PLAYER_KEY;
  });
  const [form, setForm] = useState({ displayName: "", constualUsername: "", xUsername: "", preferredLanguage: 1 });

  const pushToast = useCallback((kind: Toast["kind"], message: string) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  // Create the Phaser game once. Creation is deferred via setTimeout so React
  // StrictMode's mount→unmount→mount probe cancels the throwaway instance in
  // cleanup before it's ever created — guaranteeing a single WebGL context.
  useEffect(() => {
    let phaserGame: Phaser.Game | null = null;
    let ro: ResizeObserver | null = null;
    const id = window.setTimeout(() => {
      const parent = containerRef.current;
      if (!parent || gameRef.current) return;
      // size to the actual container (100dvh) — not window.innerHeight, which on
      // mobile includes the area under the browser chrome and crops the bottom
      phaserGame = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        backgroundColor: "#0c1022",
        pixelArt: true,
        width: parent.clientWidth || window.innerWidth,
        height: parent.clientHeight || window.innerHeight,
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
        // roundPixels stops tile seams from tearing/shimmering while the camera
        // pans (very noticeable on high-DPI mobile); antialias off keeps pixel art
        // crisp. preserveDrawingBuffer is left off — on some mobile GPUs it leaves
        // smear/ghost trails while moving.
        roundPixels: true,
        render: { roundPixels: true, antialias: false },
        physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
        scene: [PreloadScene, MainWorldScene],
      });
      gameRef.current = phaserGame;
      phaserGame.registry.set("playerKey", playerKey);
      // keep the canvas matched to the container as mobile chrome shows/hides
      ro = new ResizeObserver(() => {
        const g = gameRef.current;
        if (g && parent.clientWidth && parent.clientHeight) g.scale.resize(parent.clientWidth, parent.clientHeight);
      });
      ro.observe(parent);
    }, 0);
    return () => {
      window.clearTimeout(id);
      ro?.disconnect();
      phaserGame?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // background music — starts on the first user gesture (autoplay policy)
  useEffect(() => {
    const music = new MusicSystem();
    musicRef.current = music;
    const startOnce = () => {
      music.start();
      window.removeEventListener("pointerdown", startOnce);
      window.removeEventListener("keydown", startOnce);
    };
    window.addEventListener("pointerdown", startOnce);
    window.addEventListener("keydown", startOnce);
    return () => {
      window.removeEventListener("pointerdown", startOnce);
      window.removeEventListener("keydown", startOnce);
      music.destroy();
      musicRef.current = null;
    };
  }, []);

  // lock page scroll while the full-screen game is mounted (mobile fix)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = { htmlOverflow: html.style.overflow, bodyOverflow: body.style.overflow, bodyOverscroll: body.style.overscrollBehavior };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
    };
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      musicRef.current?.setMuted(next);
      return next;
    });
  }, []);

  // Phaser -> React
  useEffect(() => {
    const offDialog = gameBridge.on("dialog:show", (p) => {
      setResult(null);
      setQuiz(null);
      setLineIndex(0);
      setDialog(p);
      musicRef.current?.playSfx("talk");
    });
    const offNotify = gameBridge.on("notify", (n) => pushToast(n.kind, n.message));
    const offXp = gameBridge.on("xp:notify", (p) => {
      setXp(p);
      window.setTimeout(() => setXp(null), 3200);
    });
    const offReady = gameBridge.on("game:ready", () => setShowIntro(true));
    const offSfx = gameBridge.on("sfx", (s) => musicRef.current?.playSfx(s.name));
    // fallback: also poll the registry flag (covers cases where the event fired
    // before this listener attached, e.g. hot reloads)
    const poll = window.setInterval(() => {
      if (gameRef.current?.registry.get("worldReady")) {
        setShowIntro(true);
        window.clearInterval(poll);
      }
    }, 500);
    return () => {
      offDialog();
      offNotify();
      offXp();
      offReady();
      offSfx();
      window.clearInterval(poll);
    };
  }, [pushToast]);

  // React -> Phaser: wallet state
  useEffect(() => {
    const s = { address: account, isConnected, isCorrectChain, profileCreated };
    gameRef.current?.registry.set("wallet", s);
    gameBridge.emit("wallet:state", s);
  }, [account, isConnected, isCorrectChain, profileCreated]);

  // React -> Phaser: HUD stats
  useEffect(() => {
    const payload = {
      address: account,
      xp: profile ? Number(profile.xp) : 0,
      badges: profile ? Number(profile.badgeCount) : 0,
      completed: profile ? Number(profile.completedCount) : 0,
      total: zones.length,
    };
    gameRef.current?.registry.set("hud", payload);
    gameBridge.emit("hud:update", payload);
  }, [account, profile]);

  // React -> Phaser: selected player character
  useEffect(() => {
    window.localStorage.setItem("constual-player-key", playerKey);
    gameRef.current?.registry.set("playerKey", playerKey);
    gameBridge.emit("player:select", { key: playerKey });
  }, [playerKey]);

  // wallet actions
  const connect = useCallback(async () => {
    const connector = connectors[0];
    if (!connector) {
      pushToast("error", "Install a browser wallet to connect.");
      return;
    }
    try {
      await connectAsync({ connector });
    } catch {
      pushToast("error", "Wallet connection cancelled.");
    }
  }, [connectors, connectAsync, pushToast]);

  const switchNetwork = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: RITUAL_CHAIN_ID });
    } catch {
      try {
        await switchToRitualTestnet();
      } catch {
        pushToast("error", "Could not switch to Ritual Testnet.");
      }
    }
  }, [switchChainAsync, pushToast]);

  // dialog flow
  const dialogLines = dialog?.lines ?? [];
  const isLastLine = lineIndex >= dialogLines.length - 1;
  const hasQuiz = dialog?.zoneId != null;
  const currentLine = dialogLines[lineIndex] ?? "";

  // typewriter effect for the current dialog line
  useEffect(() => {
    if (!dialog) {
      setDisplayedText("");
      return;
    }
    setDisplayedText("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setDisplayedText(currentLine.slice(0, i));
      if (i >= currentLine.length) window.clearInterval(id);
    }, 22);
    return () => window.clearInterval(id);
  }, [dialog, lineIndex, currentLine]);

  const closeDialog = useCallback(() => {
    setDialog(null);
    setLineIndex(0);
    gameBridge.emit("dialog:hide", undefined);
  }, []);

  const startQuiz = useCallback(() => {
    if (!dialog || dialog.zoneId == null) return;
    const zoneId = dialog.zoneId;
    const zone = getZone(zoneId);
    setDialog(null);
    setResult(null);
    if (!zone) {
      gameBridge.emit("quiz:hide", undefined);
      return;
    }
    setQuiz({ zoneId, answers: Array(zone.quiz.length).fill(-1) });
    gameBridge.emit("quiz:show", { zoneId });
  }, [dialog]);

  // quiz flow
  const quizZone = quiz ? getZone(quiz.zoneId) : undefined;
  const closeQuiz = useCallback(() => {
    setQuiz(null);
    setResult(null);
    gameBridge.emit("quiz:hide", undefined);
  }, []);

  const selectOption = (qIndex: number, optionIndex: number) => {
    setQuiz((prev) => {
      if (!prev) return prev;
      const answers = [...prev.answers];
      answers[qIndex] = optionIndex;
      return { ...prev, answers };
    });
  };

  const allAnswered = quiz && quizZone ? quiz.answers.every((a) => a >= 0) : false;

  const submitQuiz = useCallback(async () => {
    if (!quiz || !quizZone) return;
    const total = quizZone.quiz.length;
    const correct = quizZone.quiz.reduce((acc, q, i) => acc + (quiz.answers[i] === q.correct ? 1 : 0), 0);
    const score = scoreFromQuiz(correct, total);
    const passed = correct >= passThreshold(total);
    setResult({ passed, correct, total, score });
    if (!passed) return;

    if (!isConnected) return pushToast("error", "Connect your wallet to record this quest.");
    if (!isCorrectChain) return pushToast("error", "Switch to Ritual Testnet (chain 1979) first.");
    if (!profileCreated) {
      pushToast("info", "Create your Constual Passport to record quests.");
      setShowCreate(true);
      return;
    }
    if (account && !(await hasGas(account))) {
      return pushToast("error", "Your wallet has 0 RITUAL. Get testnet RITUAL gas from the Ritual faucet, then try again.");
    }

    const languageUsed = profile?.preferredLanguage ?? 1;
    try {
      pushToast("info", "Confirm the transaction in your wallet...");
      const hash = await game.completeQuest(quizZone.id, score, languageUsed);
      pushToast("success", "Quest recorded on Ritual Testnet!");
      musicRef.current?.playSfx("success");
      setXp({ amount: score, reason: quizZone.name });
      window.setTimeout(() => setXp(null), 3200);
      gameBridge.emit("tx:result", { zoneId: quizZone.id, kind: "quest", ok: true, message: "recorded", txHash: hash });
      window.setTimeout(() => closeQuiz(), 1400);
    } catch (err) {
      const message = readableError(err);
      pushToast("error", message);
      gameBridge.emit("tx:result", { zoneId: quizZone.id, kind: "quest", ok: false, message });
    }
  }, [quiz, quizZone, isConnected, isCorrectChain, profileCreated, profile, account, game, pushToast, closeQuiz]);

  const retryQuiz = useCallback(() => {
    setResult(null);
    setQuiz((prev) => (prev && quizZone ? { ...prev, answers: Array(quizZone.quiz.length).fill(-1) } : prev));
  }, [quizZone]);

  const submitCreate = useCallback(async () => {
    if (!form.displayName.trim() || !form.constualUsername.trim()) {
      pushToast("error", "Display name and Constual username are required.");
      return;
    }
    if (account && !(await hasGas(account))) {
      pushToast("error", "Your wallet has 0 RITUAL. Get testnet RITUAL gas from the Ritual faucet, then try again.");
      return;
    }
    try {
      pushToast("info", "Confirm the transaction to create your Passport...");
      await game.createProfile(form.displayName.trim(), form.constualUsername.trim(), form.xUsername.trim(), Number(form.preferredLanguage));
      pushToast("success", "Constual Passport created!");
      setShowCreate(false);
    } catch (err) {
      pushToast("error", readableError(err));
    }
  }, [form, account, game, pushToast]);

  const shortAddr = account ? `${account.slice(0, 6)}…${account.slice(-4)}` : null;
  const xpNum = profile ? Number(profile.xp) : 0;
  const badgeNum = profile ? Number(profile.badgeCount) : 0;
  const selectedPlayer = PLAYABLE_CHARACTERS.find((c) => c.key === playerKey) ?? PLAYABLE_CHARACTERS[0];

  return (
    <div className="cg-root">
      <div className="cg-canvas" ref={containerRef} />

      {/* top bar: exit + wallet */}
      <div className="cg-topbar">
        <div className="cg-topbar-left">
          <button className="cg-btn cg-btn-ghost" type="button" onClick={() => (onExit ? onExit() : window.history.back())}>
            ← Exit
          </button>
          <button className="cg-btn cg-btn-ghost" type="button" onClick={toggleMute} aria-label="Toggle music">
            {muted ? "🔇" : "🔊"}
          </button>
          <button className="cg-btn cg-btn-ghost cg-player-button" type="button" onClick={() => setShowPlayerPicker(true)}>
            <img src={portraitPath(selectedPlayer.key)} alt="" />
            <span>{selectedPlayer.label}</span>
          </button>
        </div>
        <div className="cg-wallet">
          {!isConnected ? (
            <button className="cg-btn cg-btn-primary" type="button" onClick={connect}>
              ◈ CONNECT WALLET
            </button>
          ) : !isCorrectChain ? (
            <button className="cg-btn cg-btn-warn" type="button" onClick={switchNetwork}>
              SWITCH TO RITUAL
            </button>
          ) : (
            <div className="cg-wallet-stack">
              <button className="cg-chip" type="button" onClick={() => disconnect()}>
                ◈ {shortAddr}
              </button>
              <div className="cg-stats">
                <span className="cg-stat-xp">⚡ {xpNum} XP</span>
                <span className="cg-stat-badge">🏅 {badgeNum}</span>
                {!profileCreated && (
                  <button className="cg-mini" type="button" onClick={() => setShowCreate(true)}>
                    + PASSPORT
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* toasts + xp */}
      <div className="cg-toast-stack">
        {xp && <div className="cg-xp">⭐ +{xp.amount} pts · {xp.reason}</div>}
        {toasts.map((t) => (
          <div key={t.id} className={`cg-toast ${t.kind}`}>{t.message}</div>
        ))}
      </div>

      {/* intro guideline — shown once the world has loaded */}
      {showIntro && (
        <div className="cg-overlay cg-intro">
          <div className="cg-panel cg-intro-panel">
            <div className="cg-intro-title">CONSTUAL WORLD</div>
            <p className="cg-intro-sub">A tiny pixel town for learning health, the fun way.</p>
            <ul className="cg-intro-list">
              <li><b>Move</b> — WASD / Arrow keys, or just tap/click where you want to go</li>
              <li><b>Talk</b> — tap a character (or walk up and press <span className="cg-key">E</span>) — look for the <span className="cg-key">!</span></li>
              <li><b>Learn &amp; earn</b> — 5 teachers give quizzes; pass them to record quests on Ritual Testnet</li>
              <li><b>EXP teachers</b> - {QUEST_TEACHER_NAMES.join(", ")}</li>
              <li><b>Tip</b> — connect your wallet &amp; create a Passport to save progress on-chain</li>
            </ul>
            <button className="cg-btn cg-btn-primary cg-intro-start" type="button" onClick={() => setShowIntro(false)}>
              ▶ Start Exploring
            </button>
          </div>
        </div>
      )}

      {showPlayerPicker && (
        <div className="cg-overlay cg-character-overlay">
          <div className="cg-panel cg-character-panel">
            <div className="cg-character-head">
              <div>
                <div className="cg-progress">PLAYER CHARACTER</div>
                <h3>Choose who you want to move</h3>
              </div>
              <button className="cg-btn cg-btn-ghost" type="button" onClick={() => setShowPlayerPicker(false)}>Close</button>
            </div>
            <div className="cg-character-grid">
              {PLAYABLE_CHARACTERS.map((character) => (
                <button
                  key={character.key}
                  className={`cg-character-card ${character.key === playerKey ? "cg-selected-player" : ""}`}
                  type="button"
                  onClick={() => {
                    setPlayerKey(character.key);
                    setShowPlayerPicker(false);
                  }}
                >
                  <img src={portraitPath(character.key)} alt="" />
                  <span>{character.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* RPG dialog */}
      {dialog && (
        <div className="cg-dialog">
          <div className="cg-portrait">
            <img src={portraitPath(dialog.npcKey)} alt={dialog.npcName} />
          </div>
          <div className="cg-dialog-body">
            <div className="cg-speaker">{dialog.npcName}</div>
            <div className="cg-dialog-text">
              {displayedText}
              <span className="cg-caret">▼</span>
            </div>
            <div className="cg-dialog-actions">
              <span className="cg-dots">{lineIndex + 1} / {dialogLines.length}</span>
              <div className="cg-actions-right">
                <button className="cg-btn cg-btn-ghost" type="button" onClick={closeDialog}>Close</button>
                {!isLastLine ? (
                  <button className="cg-btn cg-btn-primary" type="button" onClick={() => setLineIndex((i) => i + 1)}>Next</button>
                ) : hasQuiz ? (
                  <button className="cg-btn cg-btn-primary" type="button" onClick={startQuiz}>Take Quiz</button>
                ) : (
                  <button className="cg-btn cg-btn-primary" type="button" onClick={closeDialog}>Got it</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* quiz */}
      {quiz && quizZone && (
        <div className="cg-overlay">
          <div className="cg-panel">
            <div className="cg-progress">Quiz · {quizZone.name} ({quizZone.nameId})</div>
            {result ? (
              <div className="cg-result">
                {result.passed ? (
                  <>
                    <strong style={{ color: "#c8f169" }}>Passed! {result.correct}/{result.total} correct.</strong>
                    <p style={{ marginTop: 8 }}>Score: <strong>{result.score}</strong> / 100.{isWriting ? " Recording on-chain..." : ""}</p>
                    <div className="cg-row">
                      <span />
                      <button className="cg-btn cg-btn-ghost" type="button" onClick={closeQuiz} disabled={isWriting}>Close</button>
                    </div>
                  </>
                ) : (
                  <>
                    <strong style={{ color: "#ffb35c" }}>{result.correct}/{result.total} correct — almost there.</strong>
                    <p style={{ marginTop: 8 }}>Review what {quizZone.npcName} said and try again.</p>
                    <div className="cg-row">
                      <button className="cg-btn cg-btn-ghost" type="button" onClick={closeQuiz}>Leave</button>
                      <button className="cg-btn cg-btn-primary" type="button" onClick={retryQuiz}>Try Again</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                {quizZone.quiz.map((q, qi) => (
                  <div key={qi}>
                    <div className="cg-quiz-q">{qi + 1}. {q.question}</div>
                    {q.options.map((opt, oi) => (
                      <button key={oi} type="button" className={`cg-option ${quiz.answers[qi] === oi ? "cg-selected" : ""}`} onClick={() => selectOption(qi, oi)}>
                        {opt}
                      </button>
                    ))}
                  </div>
                ))}
                <div className="cg-row">
                  <button className="cg-btn cg-btn-ghost" type="button" onClick={closeQuiz}>Cancel</button>
                  <button className="cg-btn cg-btn-primary" type="button" onClick={submitQuiz} disabled={!allAnswered || isWriting}>
                    {isWriting ? "Recording..." : "Submit"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* create passport */}
      {showCreate && (
        <div className="cg-overlay">
          <div className="cg-panel">
            <div className="cg-speaker" style={{ marginBottom: 6 }}>Create your Constual Passport</div>
            <p style={{ fontSize: 13, color: "#c0c8e6" }}>A one-time on-chain profile so the game can record your learning quests.</p>
            <label className="cg-field">Display name
              <input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} placeholder="e.g. Sky" />
            </label>
            <label className="cg-field">Constual username
              <input value={form.constualUsername} onChange={(e) => setForm((f) => ({ ...f, constualUsername: e.target.value }))} placeholder="e.g. sky_learns" />
            </label>
            <label className="cg-field">X username (optional)
              <input value={form.xUsername} onChange={(e) => setForm((f) => ({ ...f, xUsername: e.target.value }))} placeholder="@handle" />
            </label>
            <label className="cg-field">Preferred language
              <select value={form.preferredLanguage} onChange={(e) => setForm((f) => ({ ...f, preferredLanguage: Number(e.target.value) }))}>
                <option value={0}>Indonesia</option>
                <option value={1}>English</option>
              </select>
            </label>
            <div className="cg-row">
              <button className="cg-btn cg-btn-ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="cg-btn cg-btn-primary" type="button" onClick={submitCreate} disabled={isWriting}>
                {isWriting ? "Creating..." : "Create Passport"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function readableError(err: unknown): string {
  const raw =
    (typeof err === "object" && err && "shortMessage" in err && typeof (err as { shortMessage?: unknown }).shortMessage === "string"
      ? (err as { shortMessage: string }).shortMessage
      : err instanceof Error
        ? err.message
        : "") || "";
  const lower = raw.toLowerCase();
  if (/user rejected|denied/i.test(lower)) return "Transaction rejected in wallet.";
  if (lower.includes("insufficient funds") || lower.includes("insufficient balance") || lower.includes("gas required exceeds") || lower.includes("cannot estimate gas")) {
    return "Not enough RITUAL for gas. Get testnet RITUAL from the Ritual faucet, then try again.";
  }
  if (lower.includes("internal json-rpc error")) {
    return "Wallet couldn't submit — usually no RITUAL for gas, or a stale Ritual network RPC. Top up RITUAL and re-add the network (RPC https://rpc.ritualfoundation.org, chain 1979).";
  }
  if (raw) return raw.length > 140 ? raw.slice(0, 137) + "..." : raw;
  return "Something went wrong.";
}

// returns true if the wallet has gas; otherwise toasts a clear message
async function hasGas(address: `0x${string}`): Promise<boolean> {
  try {
    return (await publicClient.getBalance({ address })) > 0n;
  } catch {
    return true; // best-effort: don't block if the balance read fails
  }
}
