// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Seance, IERC20s} from "../src/Seance.sol";

contract DeploySeance is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address me = vm.addr(pk);
        address usd = vm.envAddress("GUSD_ADDRESS");
        vm.startBroadcast(pk);
        // the deployer is the verifier (GitHub heartbeat + launch relay) and the treasury on testnet
        Seance s = new Seance(IERC20s(usd), me, me);
        vm.stopBroadcast();
        console2.log("Seance", address(s));
    }
}
