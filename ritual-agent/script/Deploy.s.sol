// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {SovereignAgentLoop} from "../src/SovereignAgentLoop.sol";

contract Deploy is Script {
    address constant SCHEDULER = 0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        SovereignAgentLoop agent = new SovereignAgentLoop(SCHEDULER);

        console2.log("SovereignAgentLoop deployed at:", address(agent));
        console2.log("Scheduler:", SCHEDULER);
        console2.log("Owner:", vm.addr(deployerPrivateKey));

        vm.stopBroadcast();
    }
}
