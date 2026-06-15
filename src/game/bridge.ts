// A tiny typed EventEmitter that lets Phaser scenes and React talk to each other.
// Phaser cannot use React hooks, and React cannot reach inside a Phaser scene,
// so both sides import the single `gameBridge` instance below and communicate
// purely through events.

export type WalletState = {
  address: string | null;
  isConnected: boolean;
  isCorrectChain: boolean;
  profileCreated: boolean;
};

export type DialogPayload = {
  zoneId: number | null; // null = dialog-only NPC (no quiz)
  npcKey: string;
  npcName: string;
  lines: string[];
};

export type QuizPayload = {
  zoneId: number;
};

export type HudPayload = {
  address: string | null;
  xp: number;
  badges: number;
  completed: number;
  total: number;
};

// Result of an on-chain write, sent back from React into Phaser so a scene can
// update the NPC / quest state once a transaction settles.
export type TxResultPayload = {
  zoneId: number;
  kind: "quest" | "badge";
  ok: boolean;
  message: string;
  txHash?: string;
};

export type NotifyPayload = {
  kind: "info" | "success" | "error";
  message: string;
};

export type XpPayload = {
  amount: number;
  reason: string;
};

// The full event map. Keys are event names, values are payload types.
export type GameEvents = {
  // React -> Phaser
  "wallet:state": WalletState;
  "hud:update": HudPayload;
  "tx:result": TxResultPayload;
  "zone:enter": { zoneId: number };

  // Phaser -> React
  "dialog:show": DialogPayload;
  "dialog:hide": void;
  "quiz:show": QuizPayload;
  "quiz:hide": void;
  "quest:request": { zoneId: number; score: number; languageUsed: number };
  "badge:request": { zoneId: number };
  "xp:notify": XpPayload;
  notify: NotifyPayload;
};

type EventName = keyof GameEvents;
type Handler<K extends EventName> = (payload: GameEvents[K]) => void;

type AnyHandler = (payload: unknown) => void;

class GameBridge {
  // Internal storage is loosely typed; the public methods below keep callers fully typed.
  private handlers = new Map<EventName, Set<AnyHandler>>();

  on<K extends EventName>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as AnyHandler);
    return () => this.off(event, handler);
  }

  once<K extends EventName>(event: K, handler: Handler<K>): () => void {
    const wrapped: Handler<K> = (payload) => {
      this.off(event, wrapped);
      handler(payload);
    };
    return this.on(event, wrapped);
  }

  off<K extends EventName>(event: K, handler: Handler<K>): void {
    this.handlers.get(event)?.delete(handler as AnyHandler);
  }

  emit<K extends EventName>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // Clone so handlers that unsubscribe during dispatch don't break iteration.
    for (const handler of Array.from(set)) {
      handler(payload);
    }
  }

  // Remove every listener. Used when the game canvas unmounts.
  clear(): void {
    this.handlers.clear();
  }
}

// Single shared instance imported by both React and Phaser.
export const gameBridge = new GameBridge();
export type { GameBridge };
