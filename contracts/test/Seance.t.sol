// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Seance, Spirit, IERC20s} from "../src/Seance.sol";
import {GraveUSD} from "../src/GraveUSD.sol";

contract SeanceTest is Test {
    GraveUSD usd;
    Seance s;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address founder = address(0xF0);
    address verifier = address(0x7E57);
    address treasury = address(0x7EA5);
    bytes32 plot = keccak256("graveyard-shift:koso");

    function setUp() public {
        usd = new GraveUSD();
        s = new Seance(IERC20s(address(usd)), verifier, treasury);
        for (uint256 i; i < 2; i++) {
            usd.mint(alice, 5_000e6);
            usd.mint(bob, 5_000e6);
        }
        vm.prank(alice);
        usd.approve(address(s), type(uint256).max);
        vm.prank(bob);
        usd.approve(address(s), type(uint256).max);
    }

    function _launch() internal returns (uint256 id) {
        vm.prank(verifier);
        id = s.launch(plot, founder, "koso", "KOSO");
    }

    function _token(uint256 id) internal view returns (Spirit) {
        (Seance.Launch memory l,,,) = s.info(id);
        return l.token;
    }

    function test_only_verifier_launches_once() public {
        vm.prank(alice);
        vm.expectRevert(Seance.NotAllowed.selector);
        s.launch(plot, alice, "koso", "KOSO");
        uint256 id = _launch();
        assertEq(s.launchOf(plot), id + 1);
        vm.prank(verifier);
        vm.expectRevert(Seance.AlreadyRaised.selector);
        s.launch(plot, founder, "koso", "KOSO");
    }

    function test_buy_mints_and_matches_quote() public {
        uint256 id = _launch();
        uint256 q = s.quoteBuy(id, 100e6);
        vm.prank(alice);
        uint256 out = s.buy(id, 100e6, q);
        assertEq(out, q);
        assertEq(_token(id).balanceOf(alice), out);
        (Seance.Launch memory l,,,) = s.info(id);
        assertEq(l.reserve, 97e6);
        assertEq(l.pot, 2e6);
        assertEq(usd.balanceOf(treasury), 1e6);
        assertEq(usd.balanceOf(address(s)), 99e6);
    }

    function test_price_rises_with_buys() public {
        uint256 id = _launch();
        (,, uint256 p0,) = s.info(id);
        vm.prank(alice);
        s.buy(id, 500e6, 0);
        (,, uint256 p1,) = s.info(id);
        assertGt(p1, p0);
        // later buyers get fewer tokens for the same money
        uint256 first = _token(id).balanceOf(alice);
        vm.prank(bob);
        uint256 second = s.buy(id, 500e6, 0);
        assertLt(second, first);
    }

    function test_round_trip_loses_only_fees_and_reserve_stays_solvent() public {
        uint256 id = _launch();
        vm.prank(alice);
        uint256 got = s.buy(id, 1_000e6, 0);
        vm.prank(bob);
        uint256 gotB = s.buy(id, 700e6, 0);
        vm.prank(alice);
        uint256 back = s.sell(id, got, 0);
        vm.prank(bob);
        uint256 backB = s.sell(id, gotB, 0);
        assertGt(back, 1_000e6); // alice was first and sells into bob's demand
        assertLt(back + backB, 1_700e6); // but together nobody gets out more than went in
        (Seance.Launch memory l, uint256 supply,,) = s.info(id);
        assertEq(supply, 0);
        // everything left is the pot plus rounding dust
        assertLe(l.reserve, 2);
        assertEq(usd.balanceOf(address(s)), uint256(l.reserve) + l.pot);
    }

    function test_slippage_guard() public {
        uint256 id = _launch();
        uint256 q = s.quoteBuy(id, 100e6);
        vm.prank(bob);
        s.buy(id, 300e6, 0); // front-run
        vm.prank(alice);
        vm.expectRevert(Seance.Slippage.selector);
        s.buy(id, 100e6, q);
    }

    function test_rises_at_threshold() public {
        uint256 id = _launch();
        vm.prank(alice);
        s.buy(id, 1_000e6, 0);
        (Seance.Launch memory l,,,) = s.info(id);
        assertEq(l.risenAt, 0);
        vm.prank(bob);
        s.buy(id, 600e6, 0);
        (l,,,) = s.info(id);
        assertGt(l.risenAt, 0);
        assertGe(l.reserve, s.RISE_AT());
    }

    function test_pot_needs_rise_and_heartbeat() public {
        uint256 id = _launch();
        vm.prank(alice);
        s.buy(id, 2_000e6, 0);
        vm.prank(founder);
        vm.expectRevert(Seance.NotAlive.selector);
        s.claim(id);

        vm.prank(verifier);
        s.pulse(id);
        vm.prank(alice);
        vm.expectRevert(Seance.NotAllowed.selector);
        s.claim(id);

        uint256 before = usd.balanceOf(founder);
        vm.prank(founder);
        uint256 amt = s.claim(id);
        assertEq(amt, 40e6);
        assertEq(usd.balanceOf(founder) - before, 40e6);

        // flatline after 30 days without a commit
        vm.prank(bob);
        s.buy(id, 500e6, 0);
        vm.warp(block.timestamp + 31 days);
        vm.prank(founder);
        vm.expectRevert(Seance.NotAlive.selector);
        s.claim(id);
    }

    function test_pot_locked_before_rise_even_if_alive() public {
        uint256 id = _launch();
        vm.prank(alice);
        s.buy(id, 100e6, 0);
        vm.prank(verifier);
        s.pulse(id);
        vm.prank(founder);
        vm.expectRevert(Seance.NotRisen.selector);
        s.claim(id);
    }

    function test_adoption_moves_founder_seat() public {
        uint256 id = _launch();
        vm.prank(alice);
        vm.expectRevert(Seance.NotAllowed.selector);
        s.setFounder(id, alice);
        vm.prank(verifier);
        s.setFounder(id, bob);
        (Seance.Launch memory l,,,) = s.info(id);
        assertEq(l.founder, bob);
    }

    function test_only_seance_mints() public {
        uint256 id = _launch();
        Spirit t = _token(id);
        vm.expectRevert(bytes("seance"));
        t.mint(alice, 1);
    }

    function testFuzz_reserve_backs_all_sells(uint96 a, uint96 b) public {
        uint256 x = bound(uint256(a), 1e6, 4_000e6);
        uint256 y = bound(uint256(b), 1e6, 4_000e6);
        uint256 id = _launch();
        vm.prank(alice);
        uint256 ta = s.buy(id, x, 0);
        vm.prank(bob);
        uint256 tb = s.buy(id, y, 0);
        vm.prank(bob);
        s.sell(id, tb, 0);
        vm.prank(alice);
        s.sell(id, ta, 0);
        (Seance.Launch memory l,,,) = s.info(id);
        assertEq(usd.balanceOf(address(s)), uint256(l.reserve) + l.pot);
    }
}
