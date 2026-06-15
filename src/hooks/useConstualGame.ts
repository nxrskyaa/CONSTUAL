import { useCallback, useMemo, useState } from "react";
import type { Address } from "viem";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import {
  CONSTUAL_CORE_ADDRESS,
  constualAbi,
  publicClient,
  RITUAL_CHAIN_ID,
  sendConstualTransaction,
} from "../web3";

// A single profile shape the game cares about. Mirrors the on-chain struct.
export type GameProfile = {
  displayName: string;
  constualUsername: string;
  xUsername: string;
  preferredLanguage: number;
  xp: bigint;
  completedCount: bigint;
  badgeCount: bigint;
  streak: bigint;
  totalScore: bigint;
  exists: boolean;
};

export type QuestProgress = {
  completed: boolean;
  score: bigint;
  badgeClaimed: boolean;
  languageUsed: number;
  completedAt: bigint;
};

function normalizeProfile(value: unknown): GameProfile {
  const p = value as Record<string, unknown> | undefined;
  return {
    displayName: String(p?.displayName ?? ""),
    constualUsername: String(p?.constualUsername ?? ""),
    xUsername: String(p?.xUsername ?? ""),
    preferredLanguage: Number(p?.preferredLanguage ?? 0),
    xp: BigInt((p?.xp as bigint | number | undefined) ?? 0n),
    completedCount: BigInt((p?.completedCount as bigint | number | undefined) ?? 0n),
    badgeCount: BigInt((p?.badgeCount as bigint | number | undefined) ?? 0n),
    streak: BigInt((p?.streak as bigint | number | undefined) ?? 0n),
    totalScore: BigInt((p?.totalScore as bigint | number | undefined) ?? 0n),
    exists: Boolean(p?.exists ?? false),
  };
}

/**
 * useConstualGame
 *
 * One hook that wraps every ConstualCore interaction the game needs:
 *  - reactive reads: isProfileCreated, getProfile (current account)
 *  - on-demand reads: getMyProfile, getQuestProgress, hasClaimedBadge
 *  - writes: createProfile, completeQuest, claimBadge
 *
 * Writes go through `sendConstualTransaction`, which simulates the call first,
 * sends it, and waits for the receipt — the same path the rest of the app uses.
 */
export function useConstualGame() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const [isWriting, setIsWriting] = useState(false);

  const account = (address ?? null) as Address | null;
  const isCorrectChain = chainId === RITUAL_CHAIN_ID;
  const enabled = Boolean(account && isCorrectChain);

  const profileCreatedRead = useReadContract({
    address: CONSTUAL_CORE_ADDRESS,
    abi: constualAbi,
    functionName: "isProfileCreated",
    args: account ? [account] : undefined,
    chainId: RITUAL_CHAIN_ID,
    query: { enabled },
  });

  const profileRead = useReadContract({
    address: CONSTUAL_CORE_ADDRESS,
    abi: constualAbi,
    functionName: "getProfile",
    args: account ? [account] : undefined,
    chainId: RITUAL_CHAIN_ID,
    query: { enabled },
  });

  const profileCreated = profileCreatedRead.data === true;
  const profile = useMemo<GameProfile | null>(
    () => (profileRead.data ? normalizeProfile(profileRead.data) : null),
    [profileRead.data],
  );

  const refetch = useCallback(async () => {
    await Promise.all([profileCreatedRead.refetch(), profileRead.refetch()]);
  }, [profileCreatedRead, profileRead]);

  // ---- on-demand reads -----------------------------------------------------

  const getMyProfile = useCallback(async (): Promise<GameProfile | null> => {
    if (!account) return null;
    // getMyProfile() uses msg.sender, so set the caller via `account`.
    const raw = await publicClient.readContract({
      address: CONSTUAL_CORE_ADDRESS,
      abi: constualAbi,
      functionName: "getMyProfile",
      account,
    });
    return normalizeProfile(raw);
  }, [account]);

  const getQuestProgress = useCallback(
    async (diseaseId: number, user?: Address): Promise<QuestProgress | null> => {
      const target = user ?? account;
      if (!target) return null;
      const raw = (await publicClient.readContract({
        address: CONSTUAL_CORE_ADDRESS,
        abi: constualAbi,
        functionName: "getQuestProgress",
        args: [target, BigInt(diseaseId)],
      })) as readonly [boolean, bigint, boolean, number, bigint];
      return {
        completed: Boolean(raw[0]),
        score: BigInt(raw[1] ?? 0n),
        badgeClaimed: Boolean(raw[2]),
        languageUsed: Number(raw[3] ?? 0),
        completedAt: BigInt(raw[4] ?? 0n),
      };
    },
    [account],
  );

  const hasClaimedBadge = useCallback(
    async (diseaseId: number, user?: Address): Promise<boolean> => {
      const target = user ?? account;
      if (!target) return false;
      const claimed = (await publicClient.readContract({
        address: CONSTUAL_CORE_ADDRESS,
        abi: constualAbi,
        functionName: "hasClaimedBadge",
        args: [target, BigInt(diseaseId)],
      })) as boolean;
      return Boolean(claimed);
    },
    [account],
  );

  // ---- writes --------------------------------------------------------------

  const runWrite = useCallback(
    async (
      functionName: "createProfile" | "completeQuest" | "claimBadge",
      args: readonly unknown[],
    ) => {
      if (!account) throw new Error("Connect your wallet first.");
      if (!isCorrectChain) throw new Error("Switch to Ritual Testnet (chain 1979).");
      setIsWriting(true);
      try {
        const hash = await sendConstualTransaction(account, writeContractAsync, functionName, args);
        await refetch();
        return hash;
      } finally {
        setIsWriting(false);
      }
    },
    [account, isCorrectChain, writeContractAsync, refetch],
  );

  const createProfile = useCallback(
    (displayName: string, constualUsername: string, xUsername: string, preferredLanguage: number) =>
      runWrite("createProfile", [displayName, constualUsername, xUsername, preferredLanguage]),
    [runWrite],
  );

  const completeQuest = useCallback(
    async (diseaseId: number, score: number, languageUsed: number) => {
      if (score < 60 || score > 100) throw new Error("Score must be between 60 and 100.");
      // Guard against a revert: don't re-submit an already-completed quest.
      const progress = await getQuestProgress(diseaseId);
      if (progress?.completed) throw new Error("Quest already completed for this topic.");
      return runWrite("completeQuest", [BigInt(diseaseId), BigInt(score), languageUsed]);
    },
    [runWrite, getQuestProgress],
  );

  const claimBadge = useCallback(
    async (diseaseId: number) => {
      const claimed = await hasClaimedBadge(diseaseId);
      if (claimed) throw new Error("Badge already claimed for this topic.");
      return runWrite("claimBadge", [BigInt(diseaseId)]);
    },
    [runWrite, hasClaimedBadge],
  );

  return {
    // wallet / chain
    account,
    isConnected,
    chainId,
    isCorrectChain,
    // reactive profile state
    profileCreated,
    profile,
    isLoadingProfile: profileRead.isLoading || profileCreatedRead.isLoading,
    isWriting,
    refetch,
    // reads
    getMyProfile,
    getQuestProgress,
    hasClaimedBadge,
    // writes
    createProfile,
    completeQuest,
    claimBadge,
  };
}

export type UseConstualGame = ReturnType<typeof useConstualGame>;
