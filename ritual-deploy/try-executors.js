const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://rpc.ritualfoundation.org";
const CHAIN_ID = 1979;
const PRIVATE_KEY = "0xc84f348689579c5ee40516899503aa0299cbb638221016c8bd5ee19ffbe39554";

// Try addresses from TEEServiceRegistry storage + zero address
const CANDIDATES = [
  "0x0000000000000000000000000000000000000000",
  "0xd4699f679B1151CEeFE1cc8411DF22Bb3eb03057",
  "0x8ad2eaf18f12ce08d36bbdadaaf8c78f4f6f7a42",
  "0x2fefd2e272c07a8cd3e4b2d54d6ad974ec3c71af",
  "0x222802bcb27c622e951f08749f3710763a50b896", // implementation
];

async function tryExecutor(executor) {
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const messages = JSON.stringify([{ role: "user", content: "Say hi" }]);

  const llmInput = abiCoder.encode(
    [
      "address", "bytes[]", "uint256", "bytes[]", "bytes",
      "string", "string", "int256", "string", "bool",
      "int256", "string", "string", "uint256", "bool",
      "int256", "string", "bytes", "int256",
      "string", "string", "bool", "int256",
      "bytes", "bytes", "int256", "int256",
      "string", "bool", "tuple(string,string,string)",
    ],
    [executor,[],30n,[],"0x",messages,"zai-org/GLM-4.7-FP8",0n,"",false,-1n,"","",1n,false,0n,"","0x",-1n,"","",false,700n,"0x","0x",-1n,1000n,"",false,["gcs","convos/session.jsonl","GCS_CREDS"]]
  );

  const llmAbi = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "LLMCaller.abi"), "utf8"));
  const contract = new ethers.Contract("0x8705a30aBaeF2E821f211b0Cf8C363E1F8Fc09Aa", llmAbi, wallet);

  try {
    const tx = await contract.ask(llmInput, { gasLimit: 2000000 });
    const receipt = await tx.wait();
    console.log(`  OK! Tx: ${receipt.hash}`);
    return true;
  } catch (e) {
    const msg = e.message?.slice(0, 200);
    if (msg.includes("not registered")) {
      console.log(`  Not registered: ${executor}`);
    } else {
      console.log(`  Failed (${executor}): ${msg}`);
    }
    return false;
  }
}

async function main() {
  console.log("Trying executor addresses...\n");
  for (const addr of CANDIDATES) {
    const ok = await tryExecutor(addr);
    if (ok) break;
  }
}

main().catch(console.error);
