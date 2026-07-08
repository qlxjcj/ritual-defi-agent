const { ethers } = require("ethers");
require("dotenv").config();

const RPC_URL = "https://rpc.ritualfoundation.org";
const CHAIN_ID = 1979;
const CONTRACT_ADDRESS = "0xA932FE5F4ad3ec330491C0C38ffE7f074f2dF3b8";

const abi = ["function start()", "function owner() view returns (address)", "function httpInput() view returns (bytes)", "function isRunning() view returns (bool)"];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const agent = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

  console.log("Wallet:", wallet.address);
  console.log("Owner:", await agent.owner());
  console.log("isRunning:", await agent.isRunning());
  console.log("httpInput set:", (await agent.httpInput()).length > 0);

  console.log("\nCalling start() with gas limit 2,000,000...");
  try {
    const tx = await agent.start({ gasLimit: 2000000 });
    console.log("Tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("Started! Block:", receipt.blockNumber);

    for (const log of receipt.logs) {
      try {
        const parsed = agent.interface.parseLog({ topics: log.topics, data: log.data });
        console.log("Event:", parsed.name, parsed.args);
      } catch {}
    }
  } catch(e) {
    console.error("Failed:", e.shortMessage || e.message);
  }
}

main().catch(console.error);
