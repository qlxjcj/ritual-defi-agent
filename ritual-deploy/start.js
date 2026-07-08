const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://rpc.ritualfoundation.org";
const CHAIN_ID = 1979;
const PRIVATE_KEY = "0xc84f348689579c5ee40516899503aa0299cbb638221016c8bd5ee19ffbe39554";

const RITUAL_WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";
const TEE_REGISTRY = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F";
const AGENT_ADDRESS = "0xbd19CDeC4f416Bb8c01d598Fd11ae7cdb5f46d7c";

const RitualWalletABI = [
  "function deposit(uint256 lockDuration) payable",
  "function depositFor(address user, uint256 lockDuration) payable",
  "function balanceOf(address account) view returns (uint256)",
  "function lockUntil(address account) view returns (uint256)",
];

const TEERegistryABI = [
  "function activeExecutors() view returns (address[])",
  "function getExecutor(address executor) view returns (tuple(address executor, string url, uint256 stake, bool active))",
  "function executorCount() view returns (uint256)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("=== Ritual Agent Starter ===\n");
  console.log("Wallet:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "RITUAL\n");

  // 1. Check RitualWallet balance and deposit if needed
  const rw = new ethers.Contract(RITUAL_WALLET, RitualWalletABI, wallet);
  const rwBalance = await rw.balanceOf(wallet.address);
  console.log("RitualWallet balance:", ethers.formatEther(rwBalance), "RITUAL");

  const availableForDeposit = balance - ethers.parseEther("0.0002"); // reserve for gas
  if (rwBalance < ethers.parseEther("0.0005") && availableForDeposit > ethers.parseEther("0.0001")) {
    const depositAmount = availableForDeposit;
    console.log("Depositing", ethers.formatEther(depositAmount), "RITUAL to RitualWallet...");
    const tx = await rw.deposit(500, { value: depositAmount });
    await tx.wait();
    console.log("Deposit tx:", tx.hash);
    const newBal = await rw.balanceOf(wallet.address);
    console.log("RitualWallet balance now:", ethers.formatEther(newBal), "RITUAL\n");
  } else {
    console.log("RitualWallet already funded\n");
  }

  // 2. Get TEE executor
  const registry = new ethers.Contract(TEE_REGISTRY, TEERegistryABI, wallet);
  let executorAddr;
  try {
    const executors = await registry.activeExecutors();
    if (executors.length > 0) {
      executorAddr = executors[0];
      console.log("Using executor:", executorAddr);
    }
  } catch (e) {
    console.log("activeExecutors() failed, trying executorCount()...");
    try {
      const count = await registry.executorCount();
      console.log("Executor count:", count.toString());
      if (count > 0n) {
        executorAddr = await registry.getExecutor(0);
        console.log("Using executor:", executorAddr);
      }
    } catch (e2) {
      console.log("Could not get executor from registry:", e2.message);
    }
  }

  if (!executorAddr) {
    console.log("\n[!] No executor found via ABI. Using executor from storage slot 0...");
    executorAddr = "0xd4699f679b1151ceefe1cc8411df22bb3eb03057";
    console.log("  Executor:", executorAddr);
  }

  // 3. Load contract ABI
  const abi = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "SovereignAgentLoop.abi"), "utf8"));
  const agent = new ethers.Contract(AGENT_ADDRESS, abi, wallet);

  // 4. Encode Sovereign Agent input (23-field ABI)
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  const deliverySelector = ethers.id("onSovereignAgentResult(bytes32,bytes)").slice(0, 10);
  const emptyStorageRef = ["", "", ""]; // (string,string,string)

  const agentInput = abiCoder.encode(
    [
      "address",    // 0: executor
      "uint256",    // 1: ttl
      "bytes",      // 2: userPublicKey
      "uint64",     // 3: pollingIntervalBlocks
      "uint64",     // 4: pollingMaxBlock
      "string",     // 5: pollingMode
      "address",    // 6: deliveryTarget
      "bytes4",     // 7: deliverySelector
      "uint256",    // 8: deliveryGasLimit
      "uint256",    // 9: deliveryMaxFeePerGas
      "uint256",    // 10: deliveryMaxPriorityFeePerGas
      "uint16",     // 11: cliType (0=Claude Code)
      "string",     // 12: prompt
      "bytes",      // 13: encryptedSecrets
      "tuple(string,string,string)",   // 14: convoHistory
      "tuple(string,string,string)",   // 15: output
      "tuple(string,string,string)[]", // 16: skills
      "tuple(string,string,string)",   // 17: systemPrompt
      "string",     // 18: model
      "string[]",   // 19: tools
      "uint16",     // 20: maxTurns
      "uint32",     // 21: maxTokens
      "string",     // 22: rpcUrls
    ],
    [
      executorAddr,         // 0: executor
      30n,                  // 1: ttl (blocks)
      "0x",                 // 2: userPublicKey (empty = plaintext)
      10n,                  // 3: pollingIntervalBlocks
      200n,                 // 4: pollingMaxBlock
      "fixed",              // 5: pollingMode
      AGENT_ADDRESS,        // 6: deliveryTarget (self)
      deliverySelector,     // 7: deliverySelector
      800000n,              // 8: deliveryGasLimit
      20000000000n,         // 9: deliveryMaxFeePerGas (20 gwei)
      2000000000n,          // 10: deliveryMaxPriorityFeePerGas (2 gwei)
      0,                    // 11: cliType (0=Claude Code)
      "Summarize the latest block on Ritual testnet and generate a brief report", // 12: prompt
      "0x",                 // 13: encryptedSecrets (empty)
      emptyStorageRef,      // 14: convoHistory
      emptyStorageRef,      // 15: output
      [],                   // 16: skills (empty)
      emptyStorageRef,      // 17: systemPrompt
      "",                   // 18: model (default)
      [],                   // 19: tools (empty)
      1,                    // 20: maxTurns
      4096,                 // 21: maxTokens
      RPC_URL,              // 22: rpcUrls
    ]
  );

  console.log("\nAgent input encoded:", agentInput.length, "bytes");

  // 5. Call start()
  console.log("\nCalling start()...");
  try {
    const tx = await agent.start(agentInput, 50);
    console.log("Start tx hash:", tx.hash);
    await tx.wait();
    console.log("Agent started successfully!");
    console.log("View at:", `https://explorer.ritualfoundation.org/tx/${tx.hash}`);
  } catch (e) {
    console.error("Start failed:", e.message);
  }
}

main().catch(console.error);
