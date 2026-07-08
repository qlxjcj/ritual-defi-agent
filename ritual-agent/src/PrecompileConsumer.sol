// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract PrecompileConsumer {
    address internal constant SOVEREIGN_AGENT = address(0x080C);
    address internal constant LLM_INFERENCE = address(0x0802);
    address internal constant HTTP_CALL = address(0x0801);
    address internal constant ASYNC_DELIVERY = 0x5A16214fF555848411544b005f7Ac063742f39F6;

    function _executePrecompile(address precompile, bytes memory input)
        internal
        returns (bytes memory)
    {
        (bool ok, bytes memory result) = precompile.call(input);
        require(ok, string(abi.encodePacked("precompile failed: ", _getRevert(result))));
        return result;
    }

    function _getRevert(bytes memory data) private pure returns (bytes memory) {
        if (data.length < 68) return data;
        assembly {
            let len := mload(add(data, 36))
            if eq(len, 0) { mstore(add(data, 36), 32) }
            mstore(data, add(len, 4))
        }
        return data;
    }
}
