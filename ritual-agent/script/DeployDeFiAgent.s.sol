// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {DeFiStrategyAgent} from "../src/DeFiStrategyAgent.sol";

contract DeployDeFiAgent is Script {
    address constant SCHEDULER = 0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B;
    address constant EXECUTOR = 0xd4699f679B1151CEeFE1cc8411DF22Bb3eb03057;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        DeFiStrategyAgent agent = new DeFiStrategyAgent(SCHEDULER, EXECUTOR);
        console.log("DeFiStrategyAgent deployed at:", address(agent));

        vm.stopBroadcast();
    }
}
