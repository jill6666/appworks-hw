const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  impersonateAccount,
} = require("@nomicfoundation/hardhat-network-helpers");
const DATA = require("../data/constant");

const {
  BINANCE_ADDR,
  USDC_ADDR,
  UNI_ADDR,
  ADDRESS_PROVIDER,
  UNISWAP_ROUTER,
  DECIMALS,
} = DATA;

let usdc;
let uni;
let cerc20;
let cTokenA;
let cTokenB;

let binance;

let comptroller;
let priceOracle;
let interestRateModel;
let unitroller;
let repayAmount;
let flashloan;

const USDCAmount = BigInt(5000 * 1e6);
const UNIAmount = BigInt(1000 * 1e18);
const closeFactor = BigInt(0.5 * 1e18);

const init = async () => {
  [owner, user1, user2, ...accounts] = await ethers.getSigners();

  usdc = await ethers.getContractAt("ERC20", USDC_ADDR);
  uni = await ethers.getContractAt("ERC20", UNI_ADDR);

  /**
   * 部署 Comptroller
   * 部署 SimplePriceOracle
   * 部署 WhitePaperInterestRateModel
   * 部署 Unitroller
   */
  const comptrollerFactory = await ethers.getContractFactory("Comptroller");
  const priceOracleFactory = await ethers.getContractFactory(
    "SimplePriceOracle"
  );
  const interestRateModelFactory = await ethers.getContractFactory(
    "WhitePaperInterestRateModel"
  );
  const unitrollerFactory = await ethers.getContractFactory("Unitroller");

  comptroller = await comptrollerFactory.deploy();
  priceOracle = await priceOracleFactory.deploy();
  interestRateModel = await interestRateModelFactory.deploy(0, 0);
  unitroller = await unitrollerFactory.deploy();

  await unitroller._setPendingImplementation(comptroller.address);
  await unitroller._acceptImplementation();
  await comptroller._become(unitroller.address);

  comptroller = await comptrollerFactory.attach(unitroller.address);

  /**
   * 部署兩個 token
   * 使用 USDC 以及 UNI 代幣來作為 token A 以及 Token B
   */
  const CERC20Factory = await ethers.getContractFactory("CErc20Delegate");
  const delegator = await ethers.getContractFactory("CErc20Delegator");

  cerc20 = await CERC20Factory.deploy();
  cTokenA = await delegator.deploy(
    USDC_ADDR,
    comptroller.address,
    interestRateModel.address,
    BigInt(1 * 1e6),
    "USDC",
    "USDC",
    DECIMALS,
    owner.address,
    cerc20.address,
    "0x"
  );
  cTokenB = await delegator.deploy(
    UNI_ADDR,
    comptroller.address,
    interestRateModel.address,
    BigInt(1 * 1e18),
    "UNI",
    "UNI",
    DECIMALS,
    owner.address,
    cerc20.address,
    "0x"
  );
};

const setComptroller = async () => {
  const tokenAPrice = BigInt(1 * 1e18) * BigInt(1e12);
  const tokenBPrice = BigInt(10 * 1e18);
  const liquidationIncentive = BigInt(1.1 * 1e18);

  await comptroller._setPriceOracle(priceOracle.address);

  await comptroller._supportMarket(cTokenA.address);
  await comptroller._supportMarket(cTokenB.address);
  /** Liquidation incentive 設為 10%（1.1 * 1e18) */
  await comptroller._setLiquidationIncentive(liquidationIncentive);
  /** 設定 UNI 的 collateral factor 為 50% */
  await comptroller._setCloseFactor(closeFactor);
  /** 在 Oracle 中設定 USDC 的價格為 $1，UNI 的價格為 $10 */
  await priceOracle.setUnderlyingPrice(cTokenA.address, tokenAPrice);
  await priceOracle.setUnderlyingPrice(cTokenB.address, tokenBPrice);

  await comptroller._setCollateralFactor(cTokenA.address, BigInt(0.9 * 1e18));
  await comptroller._setCollateralFactor(cTokenB.address, BigInt(0.5 * 1e18));
};

describe("Flash Loan", async () => {
  before(async () => {
    await init();
  });

  describe("Transfer 1000 UNI to owner and transfer 10000 USDC to user1.", async () => {
    it("Make sure the balance of UNI in Binance Wallet is more than what's we need.", async () => {
      let balance = await uni.balanceOf(BINANCE_ADDR);

      expect(balance).to.gt(UNIAmount);
    });

    it("Make sure the balance of USDC in Binance Wallet is more than what's we need.", async () => {
      let balance = await usdc.balanceOf(BINANCE_ADDR);

      expect(balance).to.gt(USDCAmount);
    });

    it("Transfer 1000 UNI to owner.", async () => {
      await impersonateAccount(BINANCE_ADDR);

      binance = await ethers.getSigner(BINANCE_ADDR);
      uni.connect(binance).transfer(owner.address, UNIAmount);

      expect(await uni.balanceOf(owner.address)).to.eq(UNIAmount);
    });

    it("Transfer 10000 USDC to user1. ", async () => {
      await impersonateAccount(BINANCE_ADDR);

      binance = await ethers.getSigner(BINANCE_ADDR);
      usdc.connect(binance).transfer(user1.address, USDCAmount);

      expect(await usdc.balanceOf(user1.address)).to.eq(USDCAmount);
    });
  });

  describe("Borrow USDC by UNI as collateral.", async () => {
    it("To set oracle & comptroller.", async () => {
      await setComptroller();
    });

    it("Approve 1000 cTokenB(UNI) by owner.", async () => {
      await uni.approve(cTokenB.address, UNIAmount);
      await cTokenB.mint(UNIAmount);

      expect(await cTokenB.balanceOf(owner.address)).to.eq(UNIAmount);
    });

    it("Approve 1000 cTokenA(USDC) by user1.", async () => {
      await usdc.connect(user1).approve(cTokenA.address, USDCAmount);

      await cTokenA.connect(user1).mint(USDCAmount);

      expect(Number(await cTokenA.balanceOf(user1.address))).to.eq(
        Number(USDCAmount) * 1e12
      );
    });

    it("Let cTokenB(UNI) enter markets.", async () => {
      await comptroller.enterMarkets([cTokenB.address]);
    });

    /** Owner 使用 1000 顆 UNI 作為抵押品借出 5000 顆 USDC */
    it("Owner borrow cTokenA(USDC) with collateral of cTokenB(UNI).", async () => {
      await cTokenA.borrow(USDCAmount);

      expect(await usdc.balanceOf(owner.address)).to.eq(USDCAmount);
    });
  });

  describe("Change price oracle and liquidate by AAVE flashloan.", async () => {
    it("Set underlying price to $6.2 of UNI(tokenB).", async () => {
      /** 將 UNI 價格改為 $6.2 */
      await priceOracle.setUnderlyingPrice(cTokenB.address, BigInt(6.2 * 1e18));
    });

    it("Check if it already has Shortfall and owner's liquidity should be 0.", async () => {
      let result = await comptroller.getAccountLiquidity(owner.address);
      /** 產生 Shortfall */
      expect(result[1]).to.eq(0);
      expect(result[2]).to.gt(0);
    });

    it("Deploy AaveFlashLoan contract.", async () => {
      let borrowBalance = await cTokenA.callStatic.borrowBalanceCurrent(
        owner.address
      );

      repayAmount = (BigInt(borrowBalance) * closeFactor) / BigInt(1e18);

      const flashloanFactory = await ethers.getContractFactory("AaveFlashLoan");
      flashloan = await flashloanFactory
        .connect(user1)
        .deploy(
          ADDRESS_PROVIDER,
          UNISWAP_ROUTER,
          cTokenA.address,
          cTokenB.address,
          owner.address,
          repayAmount
        );
    });

    it("Execute ...", async () => {
      await flashloan.connect(user1).flashLoan(USDC_ADDR, repayAmount);
      /**
       * 透過 AAVE 的 Flash loan 來清算
       * 可以自行檢查清算 50% 後是不是大約可以賺 121 USD
       * result: $121.739940
       */
      expect(await usdc.balanceOf(user1.address)).to.gt(0);
    });
  });
});
