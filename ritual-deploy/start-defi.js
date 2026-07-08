const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const RPC_URL = "https://rpc.ritualfoundation.org";
const CHAIN_ID = 1979;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const EXECUTOR = "0xd4699f679B1151CEeFE1cc8411DF22Bb3eb03057";
const DEFILLAMA_URL = "https://api.llama.fi/v2/chains";
const CONTRACT_ADDRESS = "0xdfbBDf676d1d28eb6431841C4F00970774a4139D";

const RitualWalletABI = [
  "function deposit(uint256 lockDuration) payable",
  "function depositFor(address user, uint256 lockDuration) payable",
  "function balanceOf(address account) view returns (uint256)",
];

async function main() {
  if (!PRIVATE_KEY) { console.log("[!] Set PRIVATE_KEY in .env\n"); return; }
  if (!CONTRACT_ADDRESS) { console.log("[!] Set CONTRACT_ADDRESS\n"); return; }

  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("=== DeFi Strategy Agent Setup ===\n");
  console.log("Wallet:", wallet.address);
  console.log("Agent:", CONTRACT_ADDRESS);

  const abi = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "DeFiStrategyAgent.abi"), "utf8"));
  const agent = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const httpInput = abiCoder.encode(
    ["address", "bytes[]", "uint256", "bytes[]", "bytes", "string", "uint8", "string[]", "string[]", "bytes", "uint256", "uint8", "bool"],
    [EXECUTOR, [], 30n, [], "0x", DEFILLAMA_URL, 1, [], [], "0x", 0n, 0, false]
  );

  console.log("\nSetting HTTP input...");
  let tx = await agent.setHttpInput(httpInput);
  await tx.wait();
  console.log("  Tx:", tx.hash);

  console.log("\nSetting config...");
  tx = await agent.setConfig("zai-org/GLM-4.7-FP8", 700n);
  await tx.wait();
  console.log("  Tx:", tx.hash);

  console.log("\n=== Step 1: Fetching DeFi data ===");
  tx = await agent.fetch({ gasLimit: 2000000 });
  const receipt = await tx.wait();
  console.log("  Tx:", tx.hash);
  console.log("  Block:", receipt.blockNumber);

  for (const log of receipt.logs) {
    try {
      const parsed = agent.interface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "DataFetched") {
        console.log("  DataFetched:", parsed.args.dataLength.toString(), "bytes");
      }
    } catch {}
  }

  console.log("\n=== Step 2: Analyzing with LLM ===");
  tx = await agent.analyze({ gasLimit: 2000000 });
  const receipt2 = await tx.wait();
  console.log("  Tx:", tx.hash);
  console.log("  Block:", receipt2.blockNumber);

  for (const log of receipt2.logs) {
    try {
      const parsed = agent.interface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "StrategyReport") {
        console.log("\n=== Strategy Report ===");
        console.log(parsed.args.analysis);
      }
    } catch {}
  }

  const lastAnalysis = await agent.lastAnalysis();
  if (lastAnalysis) {
    console.log("\n=== Stored Analysis ===");
    console.log(lastAnalysis);
  }
}

main().catch(console.error);
