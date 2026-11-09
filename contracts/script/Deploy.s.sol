// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Graveyard, IERC20} from "../src/Graveyard.sol";
import {GraveUSD} from "../src/GraveUSD.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address me = vm.addr(pk);
        vm.startBroadcast(pk);
        GraveUSD usd = new GraveUSD();
        // the deployer is also the verifier (the server's GitHub checker) and the treasury on testnet
        Graveyard g = new Graveyard(IERC20(address(usd)), me, me, 250);
        vm.stopBroadcast();
        console2.log("GraveUSD", address(usd));
        console2.log("Graveyard", address(g));
    }
}
