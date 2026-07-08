const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const RPC_URL = "https://rpc.ritualfoundation.org";
const CHAIN_ID = 1979;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const EXECUTOR = "0xd4699f679B1151CEeFE1cc8411DF22Bb3eb03057";

async function main() {
  if (!PRIVATE_KEY) {
    console.log("[!] Set PRIVATE_KEY in .env file first.");
    console.log("    cp .env.example .env  then edit .env\n");
    return;
  }
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} RITUAL\n`);

  if (balance === 0n) {
    console.log("[!] No RITUAL. Get testnet tokens at:");
    console.log("    https://faucet.ritualfoundation.org");
    console.log(`    Address: ${wallet.address}\n`);
    return;
  }

  const outDir = path.join(__dirname, "out");
  const bin = fs.readFileSync(path.join(outDir, "DeFiStrategyAgent.bin"), "utf8").trim();
  const abi = JSON.parse(fs.readFileSync(path.join(outDir, "DeFiStrategyAgent.abi"), "utf8"));

  console.log("Deploying DeFiStrategyAgent...");
  console.log("Executor:", EXECUTOR, "\n");

  const factory = new ethers.ContractFactory(abi, bin, wallet);
  const contract = await factory.deploy(EXECUTOR);
  await contract.waitForDeployment();

  const addr = await contract.getAddress();
  console.log(`Deployed!`);
  console.log(`Address:  ${addr}`);
  console.log(`Explorer: https://explorer.ritualfoundation.org/address/${addr}`);
}

main().catch(console.error);
