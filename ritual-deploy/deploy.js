const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://rpc.ritualfoundation.org";
const CHAIN_ID = 1979;
const PRIVATE_KEY = "0xc84f348689579c5ee40516899503aa0299cbb638221016c8bd5ee19ffbe39554";
const SCHEDULER = "0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Address: ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} RITUAL`);

  if (balance === 0n) {
    console.log("\n[!] 余额为 0，请先去水龙头领测试币:");
    console.log("    https://faucet.ritualfoundation.org");
    console.log("    输入地址:", wallet.address);
    console.log("    然后重新运行此脚本\n");
    return;
  }

  const outDir = path.join(__dirname, "out");
  const bin = fs.readFileSync(path.join(outDir, "SovereignAgentLoop.bin"), "utf8").trim();
  const abi = JSON.parse(fs.readFileSync(path.join(outDir, "SovereignAgentLoop.abi"), "utf8"));

  console.log("\n部署 SovereignAgentLoop...");
  console.log(`Scheduler: ${SCHEDULER}`);

  const factory = new ethers.ContractFactory(abi, "0x" + bin, wallet);
  const contract = await factory.deploy(SCHEDULER);
  await contract.waitForDeployment();

  const addr = await contract.getAddress();
  console.log(`\n✅ 部署成功!`);
  console.log(`合约地址: ${addr}`);
  console.log(`Explorer: https://explorer.ritualfoundation.org/address/${addr}`);
}

main().catch(console.error);
