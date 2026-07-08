const { ethers } = require("ethers");

const RPC_URL = "https://rpc.ritualfoundation.org";
const CHAIN_ID = 1979;
const PRIVATE_KEY = "0xc84f348689579c5ee40516899503aa0299cbb638221016c8bd5ee19ffbe39554";

const TEE_REGISTRY = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F";
const AGENT_ADDRESS = "0xbd19CDeC4f416Bb8c01d598Fd11ae7cdb5f46d7c";

const TEERegistryABI = [
  "function activeExecutors() view returns (address[])",
  "function executorCount() view returns (uint256)",
  "function getExecutor(uint256 index) view returns (address)",
  "function executors(uint256 index) view returns (address)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Checking TEEServiceRegistry...");
  const registry = new ethers.Contract(TEE_REGISTRY, TEERegistryABI, wallet);

  const methods = ["executorCount", "activeExecutors", "getExecutor", "executors"];
  for (const m of methods) {
    try {
      let result;
      if (m === "getExecutor" || m === "executors") {
        try { result = await registry[m](0); } catch { continue; }
      } else {
        result = await registry[m]();
      }
      console.log(`${m}():`, result);
    } catch (e) {
      console.log(`${m}(): FAILED -`, e.message?.slice(0, 100));
    }
  }

  // Try read storage slots directly
  console.log("\nTrying raw storage reads...");
  for (let slot = 0; slot < 10; slot++) {
    const val = await provider.getStorage(TEE_REGISTRY, slot);
    if (val !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      console.log(`  slot ${slot}: ${val}`);
    }
  }

  // Check if we can staticcall the Sovereign Agent precompile with a real-looking input
  console.log("\nTesting Sovereign Agent precompile (0x080C) with minimal input...");
  try {
    const result = await provider.call({
      to: "0x000000000000000000000000000000000000080C",
      data: "0x"
    });
    console.log("  Precompile responds:", result);
  } catch (e) {
    console.log("  Precompile call failed:", e.message?.slice(0, 100));
  }
}

main().catch(console.error);
