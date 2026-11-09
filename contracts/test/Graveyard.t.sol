// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Graveyard, IERC20} from "../src/Graveyard.sol";
import {GraveUSD} from "../src/GraveUSD.sol";

contract GraveyardTest is Test {
    GraveUSD usd;
    Graveyard g;
    address buyer = address(0xB0B);
    address seller = address(0x5E11);
    address verifier = address(0x7E57);
    address treasury = address(0x7EA5);
    bytes32 plot = keccak256("chogstack");

    function setUp() public {
        usd = new GraveUSD();
        g = new Graveyard(IERC20(address(usd)), verifier, treasury, 250);
        usd.mint(buyer, 1_000e6);
        vm.prank(buyer);
        usd.approve(address(g), type(uint256).max);
    }

    function _adopt() internal returns (uint256 id) {
        vm.prank(buyer);
        id = g.adopt(plot, seller, 400e6, 3 days);
    }

    function test_adopt_locks_funds() public {
        uint256 id = _adopt();
        assertEq(usd.balanceOf(address(g)), 400e6);
        assertEq(g.openDealOf(plot), id + 1);
        assertEq(uint8(g.deal(id).state), uint8(Graveyard.State.Funded));
    }

    function test_plot_taken() public {
        _adopt();
        vm.prank(buyer);
        vm.expectRevert(Graveyard.PlotTaken.selector);
        g.adopt(plot, seller, 400e6, 3 days);
    }

    function test_buyer_confirm_pays_seller_minus_fee() public {
        uint256 id = _adopt();
        vm.prank(buyer);
        g.confirm(id);
        assertEq(usd.balanceOf(seller), 390e6);
        assertEq(usd.balanceOf(treasury), 10e6);
        assertEq(g.openDealOf(plot), 0);
    }

    function test_verifier_attest() public {
        uint256 id = _adopt();
        vm.prank(verifier);
        g.attest(id);
        assertEq(usd.balanceOf(seller), 390e6);
    }

    function test_stranger_cannot_release() public {
        uint256 id = _adopt();
        vm.prank(seller);
        vm.expectRevert(Graveyard.NotAllowed.selector);
        g.confirm(id);
        vm.prank(seller);
        vm.expectRevert(Graveyard.NotAllowed.selector);
        g.attest(id);
    }

    function test_buyer_refund_only_after_deadline() public {
        uint256 id = _adopt();
        vm.prank(buyer);
        vm.expectRevert(Graveyard.TooEarly.selector);
        g.refund(id);
        vm.warp(block.timestamp + 3 days);
        vm.prank(buyer);
        g.refund(id);
        assertEq(usd.balanceOf(buyer), 1_000e6);
        assertEq(g.openDealOf(plot), 0);
    }

    function test_seller_can_back_out_anytime() public {
        uint256 id = _adopt();
        vm.prank(seller);
        g.refund(id);
        assertEq(usd.balanceOf(buyer), 1_000e6);
    }

    function test_no_double_settle() public {
        uint256 id = _adopt();
        vm.prank(buyer);
        g.confirm(id);
        vm.prank(seller);
        vm.expectRevert(Graveyard.BadState.selector);
        g.refund(id);
    }

    function test_relist_after_refund() public {
        uint256 id = _adopt();
        vm.prank(seller);
        g.refund(id);
        uint256 id2 = _adopt();
        assertEq(id2, 1);
    }

    function test_bad_inputs() public {
        vm.startPrank(buyer);
        vm.expectRevert(Graveyard.BadInput.selector);
        g.adopt(plot, buyer, 1e6, 3 days);
        vm.expectRevert(Graveyard.BadInput.selector);
        g.adopt(plot, seller, 0, 3 days);
        vm.expectRevert(Graveyard.BadInput.selector);
        g.adopt(plot, seller, 1e6, 10 minutes);
        vm.stopPrank();
    }

    function test_mint_cap() public {
        vm.expectRevert(bytes("cap"));
        usd.mint(buyer, 5_001e6);
    }
}
