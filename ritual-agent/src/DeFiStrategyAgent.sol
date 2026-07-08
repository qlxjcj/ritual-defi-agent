// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PrecompileConsumer} from "./PrecompileConsumer.sol";

contract DeFiStrategyAgent is PrecompileConsumer {
    struct StorageRef {
        string platform;
        string path;
        string keyRef;
    }

    address public immutable owner;
    address public executor;
    bytes public httpInput;
    string public llmModel = "zai-org/GLM-4.7-FP8";
    int256 public temperature = 700;

    uint256 public cycleCount;
    string public lastRawData;
    string public lastAnalysis;
    uint256 public lastFetchedAt;
    uint256 public lastAnalyzedAt;

    event DataFetched(uint256 indexed cycle, uint256 dataLength);
    event StrategyReport(uint256 indexed cycle, string analysis);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor(address _executor) {
        owner = msg.sender;
        executor = _executor;
    }

    function setExecutor(address _executor) external onlyOwner {
        executor = _executor;
    }

    function setHttpInput(bytes calldata _input) external onlyOwner {
        httpInput = _input;
    }

    function setConfig(string calldata _model, int256 _temp) external onlyOwner {
        llmModel = _model;
        temperature = _temp;
    }

    function fetch() external {
        require(httpInput.length > 0, "httpInput not set");

        bytes memory result = _executePrecompile(HTTP_CALL, httpInput);
        (uint16 statusCode, , , bytes memory body, string memory errorMsg) =
            abi.decode(result, (uint16, string[], string[], bytes, string));

        require(statusCode == 200, errorMsg);

        lastRawData = string(body);
        cycleCount++;
        lastFetchedAt = block.timestamp;
        emit DataFetched(cycleCount, body.length);
    }

    function analyze() external {
        require(bytes(lastRawData).length > 0, "no data to analyze");

        bytes memory input = _buildLLMInput(lastRawData);
        bytes memory result = _executePrecompile(LLM_INFERENCE, input);

        (bool hasError, bytes memory completionData, bytes memory modelMetadata, string memory errorMsg, StorageRef memory convoHistory) =
            abi.decode(result, (bool, bytes, bytes, string, StorageRef));

        require(!hasError, errorMsg);

        lastAnalysis = string(completionData);
        lastAnalyzedAt = block.timestamp;
        emit StrategyReport(cycleCount, lastAnalysis);
    }

    function _buildLLMInput(string memory data) internal view returns (bytes memory) {
        return abi.encode(
            executor,
            new bytes[](0),
            uint256(30),
            new bytes[](0),
            bytes(""),
            string.concat(
                '[{"role":"user","content":"You are a DeFi strategy analyst. '
                'Analyze this DeFi protocol data and give a concise Chinese report '
                'covering: 1) Top protocols by TVL, 2) Notable yield opportunities, '
                '3) Risk assessment, 4) Recommended actions. Data: ',
                data,
                '"}]'
            ),
            llmModel,
            int256(0),
            "",
            false,
            int256(-1),
            "",
            "",
            uint256(1),
            false,
            int256(0),
            "",
            bytes(""),
            int256(-1),
            "",
            "",
            false,
            temperature,
            bytes(""),
            bytes(""),
            int256(-1),
            int256(1000),
            "",
            false,
            StorageRef("gcs", "convos/defi-session.jsonl", "GCS_CREDS")
        );
    }

    receive() external payable {}
}
