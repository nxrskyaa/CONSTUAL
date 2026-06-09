import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  keccak256,
  parseAbi,
  toBytes,
  type Address,
} from "viem";
import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

export const RITUAL_CHAIN_ID = 1979;
export const RITUAL_CHAIN_HEX = "0x7bb";
export const CONSTUAL_CORE_ADDRESS = getAddress("0x8b32508B6bB0Ac1b8067dfD1a4CA6E5195181144");

export const ritualTestnet = defineChain({
  id: RITUAL_CHAIN_ID,
  name: "Ritual Testnet",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.ritualfoundation.org"] },
    public: { http: ["https://rpc.ritualfoundation.org"] },
  },
  blockExplorers: { default: { name: "Ritual Explorer", url: "https://explorer.ritualfoundation.org" } },
});

export const wagmiConfig = createConfig({
  chains: [ritualTestnet],
  connectors: [injected()],
  transports: {
    [ritualTestnet.id]: http("https://rpc.ritualfoundation.org"),
  },
});

export const publicClient = createPublicClient({
  chain: ritualTestnet,
  transport: http("https://rpc.ritualfoundation.org"),
});

export const constualAbi = parseAbi([
  "function createProfile(string displayName,string constualUsername,string xUsername,uint8 preferredLanguage)",
  "function updateProfile(string displayName,string constualUsername,string xUsername,uint8 preferredLanguage)",
  "function getProfile(address user) view returns ((string displayName,string constualUsername,string xUsername,uint8 preferredLanguage,uint256 xp,uint256 completedCount,uint256 badgeCount,uint256 streak,uint256 lastActiveDay,uint256 totalScore,uint256 quizCount,uint256 classifierUseCount,uint256 agentGuideCount,uint256 createdAt,uint256 updatedAt,bool exists))",
  "function getMyProfile() view returns ((string displayName,string constualUsername,string xUsername,uint8 preferredLanguage,uint256 xp,uint256 completedCount,uint256 badgeCount,uint256 streak,uint256 lastActiveDay,uint256 totalScore,uint256 quizCount,uint256 classifierUseCount,uint256 agentGuideCount,uint256 createdAt,uint256 updatedAt,bool exists))",
  "function isProfileCreated(address user) view returns (bool)",
  "function isConstualUsernameAvailable(string username) view returns (bool)",
  "function completeQuest(uint256 diseaseId,uint256 score,uint8 languageUsed)",
  "function claimBadge(uint256 diseaseId)",
  "function hasCompletedQuest(address user,uint256 diseaseId) view returns (bool)",
  "function hasClaimedBadge(address user,uint256 diseaseId) view returns (bool)",
  "function canClaimBadge(address user,uint256 diseaseId) view returns (bool)",
  "function getQuestProgress(address user,uint256 diseaseId) view returns (bool completed,uint256 score,bool badgeClaimed,uint8 languageUsed,uint256 completedAt)",
  "function getCompletedDiseaseIds(address user) view returns (uint256[])",
  "function getUserCount() view returns (uint256)",
  "function getUsers(uint256 offset,uint256 limit) view returns (address[])",
  "function getAccuracy(address user) view returns (uint256)",
  "function recordClassifierUse(uint8 classifierType,bytes32 resultCategoryHash,uint8 languageUsed)",
  "function recordAgentGuide(uint256 topicId,uint8 languageUsed,bytes32 guideHash)",
]);

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export async function switchToRitualTestnet() {
  if (!window.ethereum) {
    throw new Error("Install a browser wallet first.");
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: RITUAL_CHAIN_HEX }],
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
    if (code !== 4902) {
      throw error;
    }

    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: RITUAL_CHAIN_HEX,
          chainName: "Ritual Testnet",
          rpcUrls: ["https://rpc.ritualfoundation.org"],
          nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
          blockExplorerUrls: ["https://explorer.ritualfoundation.org"],
        },
      ],
    });
  }
}

export async function sendConstualTransaction(
  account: Address,
  writeContractAsync: (request: any) => Promise<`0x${string}`>,
  functionName:
    | "createProfile"
    | "updateProfile"
    | "completeQuest"
    | "claimBadge"
    | "recordClassifierUse"
    | "recordAgentGuide",
  args: readonly unknown[],
) {
  await publicClient.simulateContract({
    address: CONSTUAL_CORE_ADDRESS,
    abi: constualAbi,
    functionName,
    account,
    args,
  } as Parameters<typeof publicClient.simulateContract>[0]);

  const hash = await writeContractAsync({
    address: CONSTUAL_CORE_ADDRESS,
    abi: constualAbi,
    functionName,
    args,
    chainId: RITUAL_CHAIN_ID,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export function guideProofHash(scenarioId: number, language: number, walletAddress: Address) {
  return keccak256(toBytes(`${scenarioId}:${language}:${walletAddress}`));
}
