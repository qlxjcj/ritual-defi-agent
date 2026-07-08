// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IScheduler {
    function schedule(
        bytes calldata data,
        uint256 gasLimit,
        uint32 startBlock,
        uint8 retrySlots,
        uint8 frequency,
        uint32 ttl,
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas,
        uint256 value,
        address payer
    ) external returns (uint256 callId);

    function cancel(uint256 callId) external;
}
