// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PrecompileConsumer} from "./PrecompileConsumer.sol";
import {IScheduler} from "./IScheduler.sol";

contract SovereignAgentLoop is PrecompileConsumer {
    IScheduler public immutable scheduler;
    address public immutable owner;

    uint256 public callId;
    uint256 public wakeCount;
    uint32 public nextWakeDelay = 50;
    bool public isRunning;

    string public lastResult;

    event AgentStarted(uint256 callId);
    event AgentWoke(uint256 indexed wakeCount);
    event AgentResult(bytes32 indexed jobId, string result);
    event AgentScheduled(uint256 nextCallId, uint32 atBlock);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyScheduler() {
        require(msg.sender == address(scheduler), "only scheduler");
        _;
    }

    constructor(address _scheduler) {
        owner = msg.sender;
        scheduler = IScheduler(_scheduler);
    }

    function start(bytes calldata agentInput, uint32 initialDelay) external onlyOwner {
        require(!isRunning, "already running");
        isRunning = true;
        _callAgent(agentInput);
        callId = _scheduleNext(initialDelay);
        emit AgentStarted(callId);
    }

    function stop() external onlyOwner {
        isRunning = false;
        if (callId != 0) {
            scheduler.cancel(callId);
        }
    }

    function wakeUp(bytes calldata agentInput) external onlyScheduler {
        if (!isRunning) return;
        wakeCount++;
        emit AgentWoke(wakeCount);
        _callAgent(agentInput);
        callId = _scheduleNext(nextWakeDelay);
    }

    function onSovereignAgentResult(bytes32 jobId, bytes calldata result) external {
        require(msg.sender == ASYNC_DELIVERY, "only async delivery");
        lastResult = string(result);
        emit AgentResult(jobId, lastResult);
    }

    function setWakeDelay(uint32 _delay) external onlyOwner {
        nextWakeDelay = _delay;
    }

    function _callAgent(bytes calldata input) internal {
        _executePrecompile(SOVEREIGN_AGENT, input);
    }

    function _scheduleNext(uint32 delay) internal returns (uint256) {
        uint32 targetBlock = uint32(block.number) + delay;
        uint256 nextId = scheduler.schedule(
            abi.encodeWithSelector(this.wakeUp.selector, ""),
            800_000,
            targetBlock,
            3,
            1,
            30,
            20 gwei,
            2 gwei,
            0,
            address(this)
        );
        emit AgentScheduled(nextId, targetBlock);
        return nextId;
    }

    receive() external payable {}
}
