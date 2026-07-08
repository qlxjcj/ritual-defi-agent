// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract LLMCaller {
    address constant LLM_PRECOMPILE = 0x0000000000000000000000000000000000000802;
    
    event LLMResult(bytes output);

    function ask(bytes calldata input) external returns (bytes memory) {
        (bool ok, bytes memory result) = LLM_PRECOMPILE.call(input);
        if (!ok) revert("LLM call failed");
        emit LLMResult(result);
        return result;
    }

    receive() external payable {}
}
