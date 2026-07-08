const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://rpc.ritualfoundation.org";
const CHAIN_ID = 1979;
const CONTRACT_ADDRESS = "0xdfbBDf676d1d28eb6431841C4F00970774a4139D";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);

  if (!CONTRACT_ADDRESS) {
    console.log("[!] Set CONTRACT_ADDRESS in this script first.\n");
    return;
  }

  const abi = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "DeFiStrategyAgent.abi"), "utf8"));
  const agent = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

  const running = await agent.isRunning();
  const cycleCount = await agent.cycleCount();
  const callId = await agent.callId();
  const lastRawData = await agent.lastRawData();
  const lastAnalysis = await agent.lastAnalysis();
  const fetchDelay = await agent.fetchDelay();

  console.log("=== DeFi Strategy Agent Status ===\n");
  console.log("Address:     ", CONTRACT_ADDRESS);
  console.log("Running:     ", running);
  console.log("Cycles:      ", cycleCount.toString());
  console.log("Next callId: ", callId.toString());
  console.log("Fetch delay: ", fetchDelay.toString(), "blocks (~", Math.round(Number(fetchDelay) * 0.35 / 60), "min)");
  console.log("");

  if (lastRawData && lastRawData !== "") {
    console.log("Last data length:", lastRawData.length, "chars");
    console.log("Data preview:", lastRawData.substring(0, 200), "...\n");
  } else {
    console.log("No data fetched yet.\n");
  }

  if (lastAnalysis && lastAnalysis !== "") {
    console.log("=== Latest Strategy Report ===");
    console.log(lastAnalysis);
  } else {
    console.log("No analysis generated yet.");
  }

  // Check events for recent reports
  console.log("\n--- Recent StrategyReport events ---");
  const filter = agent.filters.StrategyReport();
  const logs = await agent.queryFilter(filter, -50);
  for (const log of logs) {
    const parsed = agent.interface.parseLog({ topics: log.topics, data: log.data });
    console.log(`  Cycle #${parsed.args.cycle}: ${parsed.args.analysis.substring(0, 150)}...`);
  }
}

main().catch(console.error);
