const { ethers } = require("hardhat");
const { parseUnits } = require("ethers/lib/utils");
const { expect } = require("chai");

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

const init = async () => {
  accounts = await ethers.getSigners();
  [owner, user1, user2] = accounts;

  /**
   * 部署 Comptroller
   * 部署 SimplePriceOracle
   * 部署 WhitePaperInterestRateModel
   */
  const comptrollerFactory = await ethers.getContractFactory("Comptroller");
  const priceOracleFactory = await ethers.getContractFactory(
    "SimplePriceOracle"
  );
  const interestRateModelFactory = await ethers.getContractFactory(
    "WhitePaperInterestRateModel"
  );

  comptroller = await comptrollerFactory.deploy();
  priceOracle = await priceOracleFactory.deploy();
  interestRateModel = await interestRateModelFactory.deploy(0, 0);

  /**
   * 部署兩個 token
   */
  const totalSupply = parseUnits("10000", 18);
  const tokenAFactory = await ethers.getContractFactory("TestTokenA");
  const tokenBFactory = await ethers.getContractFactory("TestTokenB");

  tokenA = await tokenAFactory.deploy(totalSupply, "TestTokenA", "TTA");
  tokenB = await tokenBFactory.deploy(totalSupply, "TestTokenB", "TTB");

  /**
   * 部署兩個 cTokenB
   */
  const cerc20Factory = await ethers.getContractFactory("CErc20Immutable");
  cTokenA = await cerc20Factory.deploy(
    tokenA.address,
    comptroller.address,
    interestRateModel.address,
    parseUnits("1", 18),
    "cTokenA",
    "CTA",
    18,
    owner.address
  );
  cTokenB = await cerc20Factory.deploy(
    tokenB.address,
    comptroller.address,
    interestRateModel.address,
    parseUnits("1", 18),
    "cTokenB",
    "CTB",
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
  await comptroller._setLiquidationIncentive(parseUnits("1.08", 18));
  await comptroller._setCloseFactor(parseUnits("0.5", 18));

  await priceOracle.setUnderlyingPrice(cTokenA.address, parseUnits("1", 18));
  await priceOracle.setUnderlyingPrice(cTokenB.address, parseUnits("100", 18));

  await comptroller._setCollateralFactor(
    cTokenB.address,
    parseUnits("0.5", 18)
  );
};

describe("Compound", function () {
  before(async () => {
    await init();
  });

  /**
   * User1 使用 1 顆 token B 來 mint cTokenB
   * User1 使用 token B 作為抵押品來借出 50 顆 token A
   */
  it("borrow and repay", async function () {
    let liqA = 100;
    let liqB = 1;
    let borrowAmount = 50;

    console.log("🚀 owner 存 100 顆 tokenA 進去");
    await tokenA.approve(cTokenA.address, liqA);
    await cTokenA.mint(liqA);
    expect(await cTokenA.balanceOf(owner.address)).to.eq(liqA);

    console.log("🚀 user1 存 1 顆 tokenB 進去");
    await tokenB.transfer(user1.address, liqB);
    await tokenB.connect(user1).approve(cTokenB.address, liqB);
    await cTokenB.connect(user1).mint(liqB);
    expect(await cTokenB.balanceOf(user1.address)).to.eq(liqB);

    console.log("🚀 user1 借出 50 顆 tokenA...");
    await cTokenA.connect(user1).borrow(borrowAmount);

    /** user1 repay 50 tokenA */
    console.log("🚀 user1 償還 50 顆 tokenA...");
    await tokenA.connect(user1).approve(cTokenA.address, borrowAmount);
    await cTokenA.connect(user1).repayBorrow(borrowAmount);
  });

  // TODO:
  it("調整 token A 的 collateral factor，讓 user1 被 user2 清算", async function () {
    let liqA = 100;
    let liqB = 1;
    let borrowAmount = 50;

    console.log("🚀 owner 存 100 顆 tokenA 進去");
    await tokenA.approve(cTokenA.address, liqA);
    await cTokenA.mint(liqA);
    expect(await cTokenA.balanceOf(owner.address)).to.eq(200);

    console.log("🚀 user1 存 1 顆 tokenB 進去");
    await tokenB.transfer(user1.address, liqB);
    await tokenB.connect(user1).approve(cTokenB.address, liqB);
    await cTokenB.connect(user1).mint(liqB);
    expect(await cTokenB.balanceOf(user1.address)).to.eq(2);

    console.log("🚀 user1 借出 50 顆 tokenA...");
    await cTokenA.connect(user1).borrow(borrowAmount);

    expect(
      await cTokenA
        .connect(user1)
        .callStatic.borrowBalanceCurrent(user1.address)
    ).to.eq(borrowAmount);

    console.log("🚀 調整 collateral factor...");
    await comptroller._setCollateralFactor(
      cTokenB.address,
      parseUnits("0.4", 18)
    );

    console.log("🚀 user2 開始清算 user1...");
    let borrowBalance = await cTokenA
      .connect(user1)
      .callStatic.borrowBalanceCurrent(user1.address);

    let repayAmount =
      (BigInt(borrowBalance) * BigInt(0.5 * 1e18)) / BigInt(1e18);

    await tokenA.approve(cTokenA.address, repayAmount);
    await cTokenA.liquidateBorrow(user1.address, repayAmount, cTokenB.address);
  });

  it("調整 oracle 中的 token B 的價格，讓 user1 被 user2 清算", async function () {
    let liqA = 100;
    let liqB = 1;
    let borrowAmount = 50;

    console.log("🚀 owner 存 100 顆 tokenA 進去");
    await tokenA.approve(cTokenA.address, liqA);
    await cTokenA.mint(liqA);
    expect(await cTokenA.balanceOf(owner.address)).to.eq(300);

    console.log("🚀 user1 存 1 顆 tokenB 進去");
    await tokenB.transfer(user1.address, liqB);
    await tokenB.connect(user1).approve(cTokenB.address, liqB);
    await cTokenB.connect(user1).mint(liqB);
    expect(await cTokenB.balanceOf(user1.address)).to.eq(3);

    console.log("🚀 user1 借出 50 顆 tokenA...");
    await cTokenA.connect(user1).borrow(borrowAmount);

    expect(
      await cTokenA
        .connect(user1)
        .callStatic.borrowBalanceCurrent(user1.address)
    ).to.eq(100);
    // ----------------------------------------------------------------
    await priceOracle.setUnderlyingPrice(cTokenB.address, parseUnits("50", 18));

    console.log("🚀 user2 開始清算 user1...");
    let borrowBalance = await cTokenA
      .connect(user1)
      .callStatic.borrowBalanceCurrent(user1.address);

    let repayAmount =
      (BigInt(borrowBalance) * BigInt(0.5 * 1e18)) / BigInt(1e18);

    await tokenA.approve(cTokenA.address, repayAmount);
    await cTokenA.liquidateBorrow(user1.address, repayAmount, cTokenB.address);
  });
});
