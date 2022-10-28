// contracts/TWDF.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

// Import CErc20 and Comptroller
import 'compound-protocol/contracts/CErc20.sol';
import 'compound-protocol/contracts/CErc20Delegator.sol';
import 'compound-protocol/contracts/CErc20Delegate.sol';
import 'compound-protocol/contracts/Comptroller.sol';
import 'compound-protocol/contracts/Unitroller.sol';
import 'compound-protocol/contracts/WhitePaperInterestRateModel.sol';
import 'compound-protocol/contracts/SimplePriceOracle.sol';

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

import 'hardhat/console.sol';

/**
 * 
 */
contract TestToken is ERC20 {
	constructor(uint256 supply, string memory name_, string memory symbol_) ERC20(name_, symbol_) {
	}
}

contract ZeroInterestRateModel is InterestRateModel {
	function getBorrowRate(
		uint256,
		uint256,
		uint256
	) external pure override returns (uint256) {
		return 0;
	}

	function getSupplyRate(
		uint256,
		uint256,
		uint256,
		uint256
	) public pure override returns (uint256) {
		return 0;
	}
}