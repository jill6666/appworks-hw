// contracts/TWDF.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

// Import CErc20 and Comptroller
import 'compound-protocol/contracts/CErc20.sol';
import 'compound-protocol/contracts/CErc20Immutable.sol';
import 'compound-protocol/contracts/Comptroller.sol';
import 'compound-protocol/contracts/WhitePaperInterestRateModel.sol';
import 'compound-protocol/contracts/SimplePriceOracle.sol';
import 'compound-protocol/contracts/Unitroller.sol';
import 'compound-protocol/contracts/CErc20Delegate.sol';
import 'compound-protocol/contracts/CErc20Delegator.sol';

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

import 'hardhat/console.sol';

/**
 * 
 */
contract TestToken is ERC20 {
	constructor(uint256 totalSupply, string memory name_, string memory symbol_) ERC20(name_, symbol_) {
		_mint(msg.sender, totalSupply);
	}

	function mint(address account, uint256 amount) public virtual {
		_mint(account, amount);
	}
}