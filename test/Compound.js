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
  let cTokenA;
  let cTokenB;

  let comptroller;
  let priceOracle;
  let interestRateModel;

  before(async function () {
    accounts = await ethers.getSigners();
    [owner, user1, user2] = accounts;

    /**
     * 部署 Comptroller
     * 部署 SimplePriceOracle
     * 部署 WhitePaperInterestRateModel
     */
    const comptrollerFactory = await ethers.getContractFactory('Comptroller');
    const priceOracleFactory = await ethers.getContractFactory(
      'SimplePriceOracle'
    );
    const interestRateModelFactory = await ethers.getContractFactory(
      'WhitePaperInterestRateModel'
    );

    comptroller = await comptrollerFactory.deploy();
    priceOracle = await priceOracleFactory.deploy();
    interestRateModel = await interestRateModelFactory.deploy(0, 0);

    /**
     * 部署兩個 token
     */
    const totalSupply = parseUnits('10000', 18);
    const tokenAFactory = await ethers.getContractFactory('TestTokenA');
    const tokenBFactory = await ethers.getContractFactory('TestTokenB');

    tokenA = await tokenAFactory.deploy(totalSupply, 'TestTokenA', 'TTA');
    tokenB = await tokenBFactory.deploy(totalSupply, 'TestTokenB', 'TTB');

    /**
     * 部署兩個 cTokenB
     */
    const cerc20Factory = await ethers.getContractFactory('CErc20Immutable');
    cTokenA = await cerc20Factory.deploy(
      tokenA.address,
      comptroller.address,
      interestRateModel.address,
      parseUnits('1', 18),
      'cTokenA',
      'CTA',
      18,
      owner.address
    );
    cTokenB = await cerc20Factory.deploy(
      tokenB.address,
      comptroller.address,
      interestRateModel.address,
      parseUnits('1', 18),
      'cTokenB',
      'CTB',
      18,
      owner.address
    );

    /**
     * initial settings
     */
    await comptroller._setPriceOracle(priceOracle.address);
    await comptroller._supportMarket(cTokenA.address);
    await comptroller._supportMarket(cTokenB.address);
    await comptroller
      .connect(user1)
      .enterMarkets([cTokenA.address, cTokenB.address]);
    await comptroller._setLiquidationIncentive(parseUnits('1.08', 18));
    await comptroller._setCloseFactor(parseUnits('0.5', 18));

    await priceOracle.setUnderlyingPrice(cTokenA.address, parseUnits('1', 18));
    await priceOracle.setUnderlyingPrice(
      cTokenB.address,
      parseUnits('100', 18)
    );

    await comptroller._setCollateralFactor(
      cTokenB.address,
      parseUnits('0.5', 18)
    );
  });

  /**
   * User1 使用 1 顆 token B 來 mint cTokenB
   * User1 使用 token B 作為抵押品來借出 50 顆 token A
   */
  it('borrow and repay', async function () {
    // const BORROW_AMOUNT = parseUnits('50', 18);
    // /** mint cTokenB by 1 tokenB */
    // await tokenB.transfer(user1.address, parseUnits('1000', 18).toString());
    // await tokenA.transfer(user2.address, parseUnits('1000', 18).toString());
    // /** user2 存 tokenA 到池子才有流動性可以讓 user1 借出 */
    // console.log('🚀 user2 存 100 顆 tokenA 到池子...');
    // await tokenA
    //   .connect(user2)
    //   .approve(cTokenA.address, parseUnits('100', 18));
    // await cTokenA.connect(user2).mint(parseUnits('100', 18));
    // /** user1 存 1 顆 tokenB 進去，並取得 1 顆 CTokenB */
    // console.log('🚀 user1 存 1 顆 tokenB 進去，並取得 1 顆 CTokenB...');
    // await tokenB
    //   .connect(user1)
    //   .approve(cTokenB.address, parseUnits('1', 18));
    // await cTokenB.connect(user1).mint(parseUnits('1', 18));
    // /** user1 抵押品為 1 顆 TokenB($100)，collateral factor 為 50%，表示可借出 $50 等值的 tokenA($1)，也就是 50 顆 tokenA */
    // console.log('🚀 user1 借出 50 顆 tokenA...');
    // await cTokenA.connect(user1).borrow(BORROW_AMOUNT);
    // /** user1 repay 50 tokenA */
    // console.log('🚀 user1 償還 50 顆 tokenA...');
    // await tokenA
    //   .connect(user1)
    //   .approve(cTokenA.address, BORROW_AMOUNT);
    // await cTokenA.connect(user1).repayBorrow(BORROW_AMOUNT);
  });

  // TODO:
  it('調整 token A 的 collateral factor，讓 user1 被 user2 清算', async function () {
    let liqA = 100;
    let liqB = 1;
    let borrowAmount = 50;

    console.log('🚀 owner 存 100 顆 tokenA 進去');
    await tokenA.approve(cTokenA.address, liqA);
    await cTokenA.mint(liqA);

    console.log('🚀 user1 存 1 顆 tokenB 進去');
    await tokenB.transfer(user1.address, liqB);
    await tokenB.connect(user1).approve(cTokenB.address, liqB);
    await cTokenB.connect(user1).mint(liqB); // 1:1

    // enterMarkets
    await comptroller.connect(user1).enterMarkets([cTokenB.address]);

    console.log('🚀 user1 借出 50 顆 tokenA...');
    await cTokenA.connect(user1).borrow(borrowAmount);

    console.log('🚀 調整 collateral factor...');
    await comptroller._setCollateralFactor(cTokenB.address, BigInt(0.4 * 1e18));

    console.log('🚀 user2 開始清算 user1...');
    let borrowBalance = await cTokenA
      .connect(user1)
      .callStatic.borrowBalanceCurrent(user1.address);

    let repayAmount =
      (BigInt(borrowBalance) * BigInt(0.5 * 1e18)) / BigInt(1e18);

    await tokenA.approve(cTokenA.address, repayAmount);
    await cTokenA.liquidateBorrow(user1.address, repayAmount, cTokenB.address);
  });

  // TODO:
  it('調整 oracle 中的 token B 的價格，讓 user1 被 user2 清算', async function () {
    // await tokenA.mint(user2.address, parseUnits('10000', 18));
    // await tokenA
    //   .connect(user2)
    //   .approve(cTokenA.address, parseUnits('10000', 18));
    // await tokenB.mint(user1.address, parseUnits('100', 18));
    // await tokenB.approve(cTokenB.address, parseUnits('100', 18));
    // await cTokenA.connect(user2).mint(parseUnits('100', 18));
    // await cTokenB.mint(parseUnits('1', 18));
    // console.log(`📔 balanceOf user1: `, {
    //   tokenA: formatUnits(await tokenA.balanceOf(user1.address), 18),
    //   tokenB: formatUnits(await tokenB.balanceOf(user1.address), 18),
    //   cTokenA: formatUnits(
    //     await cTokenA.balanceOf(user1.address),
    //     18
    //   ),
    //   cTokenB: formatUnits(
    //     await cTokenB.balanceOf(user1.address),
    //     18
    //   ),
    // });
    // console.log(`📔 balanceOf user2: `, {
    //   tokenA: formatUnits(await tokenA.balanceOf(user2.address), 18),
    //   tokenB: formatUnits(await tokenB.balanceOf(user2.address), 18),
    //   cTokenA: formatUnits(
    //     await cTokenA.balanceOf(user2.address),
    //     18
    //   ),
    //   cTokenB: formatUnits(
    //     await cTokenB.balanceOf(user2.address),
    //     18
    //   ),
    // });
    // // TODO: BorrowComptrollerRejection
    // await cTokenA.borrow(parseUnits('50', 18));
    // await priceOracle.setUnderlyingPrice(
    //   cTokenB.address,
    //   parseUnits('10', 18)
    // );
    // await cTokenA
    //   .connect(user2)
    //   .liquidateBorrow(
    //     user1.address,
    //     parseUnits('5', 18),
    //     cTokenB.address
    //   );
  });
});
