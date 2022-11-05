const { ethers } = require('hardhat');
const { parseUnits, formatUnits } = require('ethers/lib/utils');
const { expect } = require('chai');
const helpers = require('@nomicfoundation/hardhat-network-helpers');

describe('Compound', function () {
  let accounts;
  let owner;
  let user1;
  let user2;

  let tokenA;
  let tokenB;
  let cTokenADelegator;
  let cTokenBDelegator;

  let comptroller;
  let unitroller;
  let priceOracle;
  let interestRateModel;
  let cErc20Delegate;

  before(async function () {
    accounts = await ethers.getSigners();
    [owner, user1, user2] = accounts;

    /**
     * 部署 Comptroller
     * 部署 SimplePriceOracle
     * 部署 Unitroller
     * 部署 WhitePaperInterestRateModel
     */
    const comptrollerFactory = await ethers.getContractFactory('Comptroller');
    const unitrollerFactory = await ethers.getContractFactory('Unitroller');
    const priceOracleFactory = await ethers.getContractFactory(
      'SimplePriceOracle'
    );
    const interestRateModelFactory = await ethers.getContractFactory(
      'WhitePaperInterestRateModel'
    );

    comptroller = await comptrollerFactory.deploy();
    unitroller = await unitrollerFactory.deploy();
    priceOracle = await priceOracleFactory.deploy();
    interestRateModel = await interestRateModelFactory.deploy(0, 0);

    /**
     * 部署兩個 token
     */
    const totalSupply = parseUnits('5000', 18);
    const tokenAFactory = await ethers.getContractFactory('TestToken');
    const tokenBFactory = await ethers.getContractFactory('TestToken');

    tokenA = await tokenAFactory.deploy(totalSupply, 'TestTokenA', 'TTA');
    tokenB = await tokenBFactory.deploy(totalSupply, 'TestTokenB', 'TTB');

    /**
     * 部署兩個 cToken
     */
    const cDelegateFactory = await ethers.getContractFactory('CErc20Delegate');
    const cDelegatorAFac = await ethers.getContractFactory('CErc20Delegator');
    const cDelegatorBFac = await ethers.getContractFactory('CErc20Delegator');

    cErc20Delegate = await cDelegateFactory.deploy();
    cTokenADelegator = await cDelegatorAFac.deploy(
      tokenA.address,
      comptroller.address,
      interestRateModel.address,
      parseUnits('100', 18).toString(),
      'tokenA',
      'cTokenA',
      18,
      owner.address,
      cErc20Delegate.address,
      '0x00'
    );
    cTokenBDelegator = await cDelegatorBFac.deploy(
      tokenB.address,
      comptroller.address,
      interestRateModel.address,
      parseUnits('100', 18).toString(),
      'tokenB',
      'cTokenB',
      18,
      owner.address,
      cErc20Delegate.address,
      '0x00'
    );

    /**
     * initial settings
     */
    await unitroller._setPendingImplementation(comptroller.address);
    await comptroller._become(unitroller.address);
    await comptroller._setPriceOracle(priceOracle.address);
    await comptroller._supportMarket(cTokenADelegator.address);
    await comptroller._supportMarket(cTokenBDelegator.address);
    await comptroller
      .connect(user1)
      .enterMarkets([cTokenADelegator.address, cTokenBDelegator.address]);
    await priceOracle.setUnderlyingPrice(
      cTokenADelegator.address,
      parseUnits('1', 18).toString()
    );
    await priceOracle.setUnderlyingPrice(
      cTokenBDelegator.address,
      parseUnits('100', 18).toString()
    );
    await comptroller._setCollateralFactor(
      cTokenADelegator.address,
      parseUnits('0.5', 18).toString()
    );
    await comptroller._setCollateralFactor(
      cTokenBDelegator.address,
      parseUnits('0.5', 18).toString()
    );
    /** 設置清算獎勵 % > 1 */ await comptroller._setLiquidationIncentive(
      parseUnits('1.08', 18).toString()
    );
    /** 最大清算 factor */
    await comptroller._setCloseFactor(parseUnits('0.5', 18).toString());
    // await cTokenBDelegator._setReserveFactor(parseUnits('1', 18).toString());
  });

  /**
   * User1 使用 1 顆 token B 來 mint cToken
   * User1 使用 token B 作為抵押品來借出 50 顆 token A
   */
  it('borrow and repay', async function () {
    const BORROW_AMOUNT = parseUnits('50', 18);
    /** mint cToken by 1 tokenB */
    await tokenB.transfer(user1.address, parseUnits('1000', 18).toString());
    await tokenA.transfer(user2.address, parseUnits('1000', 18).toString());
    console.log(`📔 balanceOf user1: `, {
      tokenA: formatUnits(await tokenA.balanceOf(user1.address), 18),
      tokenB: formatUnits(await tokenB.balanceOf(user1.address), 18),
    });
    console.log(`📔 balanceOf user2: `, {
      tokenA: formatUnits(await tokenA.balanceOf(user2.address), 18),
      tokenB: formatUnits(await tokenB.balanceOf(user2.address), 18),
    });

    /** user2 存 tokenA 到池子才有流動性可以讓 user1 借出 */
    console.log(
      '----------------------------------------------------------------'
    );
    console.log('🚀 user2 存 100 顆 tokenA 到池子...');
    await tokenA
      .connect(user2)
      .approve(cTokenADelegator.address, parseUnits('100', 18));
    await cTokenADelegator.connect(user2).mint(parseUnits('100', 18));
    console.log(`📔 balanceOf user2: `, {
      tokenA: formatUnits(await tokenA.balanceOf(user2.address), 18),
      cTokenADelegator: formatUnits(
        await cTokenADelegator.balanceOf(user2.address),
        18
      ),
    });

    /** user1 存 1 顆 tokenB 進去，並取得 1 顆 CTokenB */
    console.log(
      '----------------------------------------------------------------'
    );
    console.log('🚀 user1 存 1 顆 tokenB 進去，並取得 1 顆 CTokenB...');
    await tokenB
      .connect(user1)
      .approve(cTokenBDelegator.address, parseUnits('1', 18));
    await cTokenBDelegator.connect(user1).mint(parseUnits('1', 18));
    // TODO: 應該要拿到 1 顆 CTokenB 但只拿到 0.01 顆，找問題在哪
    console.log(`📔 balanceOf user1: `, {
      tokenB: formatUnits(await tokenB.balanceOf(user1.address), 18),
      cTokenBDelegator: formatUnits(
        await cTokenBDelegator.balanceOf(user1.address),
        18
      ),
    });

    /** user1 抵押品為 1 顆 TokenB($100)，collateral factor 為 50%，表示可借出 $50 等值的 tokenA($1)，也就是 50 顆 tokenA */
    console.log(
      '----------------------------------------------------------------'
    );
    console.log('🚀 user1 借出 50 顆 tokenA...');
    await cTokenADelegator.connect(user1).borrow(BORROW_AMOUNT);
    console.log(`📔 balanceOf user1: `, {
      tokenA: formatUnits(await tokenA.balanceOf(user1.address), 18),
      tokenB: formatUnits(await tokenB.balanceOf(user1.address), 18),
      cTokenBDelegator: formatUnits(
        await cTokenBDelegator.balanceOf(user1.address),
        18
      ),
    });
    console.log(`📔 balanceOf user2: `, {
      tokenA: formatUnits(await tokenA.balanceOf(user2.address), 18),
      cTokenADelegator: formatUnits(
        await cTokenADelegator.balanceOf(user2.address),
        18
      ),
    });
    /** user1 repay 50 tokenA */
    console.log(
      '----------------------------------------------------------------'
    );
    console.log('🚀 user1 償還 50 顆 tokenA...');
    console.log('user1 repayBorrow 50 tokenA...');
    await tokenA
      .connect(user1)
      .approve(cTokenADelegator.address, BORROW_AMOUNT);
    await cTokenADelegator.connect(user1).repayBorrow(BORROW_AMOUNT);

    console.log(`📔 balanceOf user1: `, {
      tokenA: formatUnits(await tokenA.balanceOf(user1.address), 18),
      tokenB: formatUnits(await tokenB.balanceOf(user1.address), 18),
      cTokenBDelegator: formatUnits(
        await cTokenBDelegator.balanceOf(user1.address),
        18
      ),
    });
  });

  // TODO:
  it('調整 token A 的 collateral factor，讓 user1 被 user2 清算', async function () {
    await tokenA.transfer(user1.address, parseUnits('1000', 18));
    await tokenA
      .connect(user1)
      .approve(cTokenADelegator.address, parseUnits('500', 18));
    await cTokenADelegator.connect(user1).mint(parseUnits('500', 18));

    await tokenB.transfer(user2.address, parseUnits('1000', 18));
    await tokenB
      .connect(user2)
      .approve(cTokenBDelegator.address, parseUnits('500', 18));
    await cTokenBDelegator.connect(user2).mint(parseUnits('500', 18));

    console.log(
      '----------------------------------------------------------------'
    );
    console.log('🚀 user1 借出 50 顆 tokenA...');
    await cTokenADelegator.connect(user1).borrow(parseUnits('50', 18));

    console.log(
      '----------------------------------------------------------------'
    );
    console.log('🚀 調整 collateral factor...');
    await comptroller._setCollateralFactor(
      cTokenBDelegator.address,
      parseUnits('0.05', 18)
    );

    console.log(
      '----------------------------------------------------------------'
    );
    console.log('🚀 user2 開始清算 user1...');
    console.log(`📔 balanceOf user1: `, {
      tokenA: formatUnits(await tokenA.balanceOf(user1.address), 18),
      tokenB: formatUnits(await tokenB.balanceOf(user1.address), 18),
      cTokenADelegator: formatUnits(
        await cTokenADelegator.balanceOf(user1.address),
        18
      ),
      cTokenBDelegator: formatUnits(
        await cTokenBDelegator.balanceOf(user1.address),
        18
      ),
    });
    console.log(`📔 balanceOf user2: `, {
      tokenA: formatUnits(await tokenA.balanceOf(user2.address), 18),
      tokenB: formatUnits(await tokenB.balanceOf(user2.address), 18),
      cTokenADelegator: formatUnits(
        await cTokenADelegator.balanceOf(user2.address),
        18
      ),
      cTokenBDelegator: formatUnits(
        await cTokenBDelegator.balanceOf(user2.address),
        18
      ),
    });
    // TODO: error: LiquidateComptrollerRejection 找一下問題在哪
    await cTokenADelegator
      .connect(user2)
      .liquidateBorrow(
        user1.address,
        parseUnits('1', 18),
        cTokenBDelegator.address
      );

    console.log(`📔 balanceOf user1: `, {
      tokenA: formatUnits(await tokenA.balanceOf(user1.address), 18),
      tokenB: formatUnits(await tokenB.balanceOf(user1.address), 18),
      cTokenADelegator: formatUnits(
        await cTokenADelegator.balanceOf(user1.address),
        18
      ),
      cTokenBDelegator: formatUnits(
        await cTokenBDelegator.balanceOf(user1.address),
        18
      ),
    });
    console.log(`📔 balanceOf user2: `, {
      tokenA: formatUnits(await tokenA.balanceOf(user2.address), 18),
      tokenB: formatUnits(await tokenB.balanceOf(user2.address), 18),
      cTokenADelegator: formatUnits(
        await cTokenADelegator.balanceOf(user2.address),
        18
      ),
      cTokenBDelegator: formatUnits(
        await cTokenBDelegator.balanceOf(user2.address),
        18
      ),
    });
  });

  // TODO:
  it('調整 oracle 中的 token B 的價格，讓 user1 被 user2 清算', async function () {});
});
