const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://rpc.ritualfoundation.org";
const CHAIN_ID = 1979;
const PRIVATE_KEY = "0xc84f348689579c5ee40516899503aa0299cbb638221016c8bd5ee19ffbe39554";

// From storage slot 0 of TEEServiceRegistry
const EXECUTOR = "0xd4699f679B1151CEeFE1cc8411DF22Bb3eb03057";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("=== Deploy LLMCaller ===\n");
  console.log("Wallet:", wallet.address);

  // Deploy LLMCaller
  const bin = fs.readFileSync(path.join(__dirname, "out", "LLMCaller.bin"), "utf8").trim();
  const abi = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "LLMCaller.abi"), "utf8"));

  const factory = new ethers.ContractFactory(abi, "0x" + bin, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log("Deployed at:", addr);
  console.log("Explorer:", `https://explorer.ritualfoundation.org/address/${addr}`);

  // Encode LLM input (30-field ABI per Ritual docs)
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const messages = JSON.stringify([{ role: "user", content: "Say hello in 10 words or less." }]);

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
    [
      EXECUTOR,          // 0: executor
      [],                // 1: encryptedSecrets
      30n,               // 2: ttl
      [],                // 3: secretSignatures
      "0x",              // 4: userPublicKey
      messages,          // 5: messagesJson
      "zai-org/GLM-4.7-FP8", // 6: model
      0n,                // 7: frequencyPenalty
      "",                // 8: logitBiasJson
      false,             // 9: logprobs
      -1n,               // 10: maxCompletionTokens
      "", "",            // 11-12: metadataJson, modalitiesJson
      1n,                // 13: n
      false,             // 14: parallelToolCalls
      0n,                // 15: presencePenalty
      "",                // 16: reasoningEffort
      "0x",              // 17: responseFormatData
      -1n,               // 18: seed
      "", "",            // 19-20: serviceTier, stopJson
      false,             // 21: stream
      700n,              // 22: temperature (0.7 * 1000)
      "0x", "0x",        // 23-24: toolChoice, tools
      -1n, 1000n,        // 25-26: topLogprobs, topP
      "",                // 27: user
      false,             // 28: piiEnabled
      ["gcs", "convos/session.jsonl", "GCS_CREDS"], // 29: convoHistory
    ]
  );

  console.log("\nCalling LLM precompile (0x0802)...");
  try {
    const tx = await contract.ask(llmInput);
    const receipt = await tx.wait();
    console.log("Tx hash:", receipt.hash);
    console.log("Explorer:", `https://explorer.ritualfoundation.org/tx/${receipt.hash}`);

    // Parse events
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === "LLMResult") {
          console.log("\n=== LLM Result ===");
          const result = abiCoder.decode(["(bool,bytes,bytes,string,(string,string,string))"], parsed.args.output);
          console.log("Error:", result[0][0]);
          console.log("Response:", result[0][3]);
        }
      } catch {}
    }
  } catch (e) {
    console.error("Call failed:", e.message);
  }
}

main().catch(console.error);
