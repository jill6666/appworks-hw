const { ethers } = require('hardhat');
const { parseUnits } = require('ethers/lib/utils');
const helpers = require('@nomicfoundation/hardhat-network-helpers');

describe('Compound', function () {
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
    [user1, user2] = await ethers.getSigners();

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
    const totalSupply = parseUnits('1', 18);
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
      parseUnits('10000', 18).toString(),
      'tokenA',
      'cTokenA',
      18,
      user1.address,
      cErc20Delegate.address,
      '0x'
    );
    cTokenBDelegator = await cDelegatorBFac.deploy(
      tokenB.address,
      comptroller.address,
      interestRateModel.address,
      parseUnits('10000', 18).toString(),
      'tokenB',
      'cTokenB',
      18,
      user2.address,
      cErc20Delegate.address,
      '0x'
    );

    /**
     * initial settings
     */
    await unitroller._setPendingImplementation(comptroller.address);
    await comptroller._become(unitroller.address);
    await comptroller._setPriceOracle(priceOracle.address);
    await comptroller._supportMarket(cTokenADelegator.address);
    await comptroller._supportMarket(cTokenBDelegator.address);
    await comptroller.enterMarkets([
      cTokenADelegator.address,
      cTokenBDelegator.address,
    ]);
    await priceOracle.setUnderlyingPrice(
      cTokenADelegator.address,
      parseUnits('0.5', 18).toString()
    );
    await priceOracle.setUnderlyingPrice(
      cTokenBDelegator.address,
      parseUnits('0.5', 18).toString()
    );
    await comptroller._setCollateralFactor(
      cTokenADelegator.address,
      parseUnits('0.5', 18).toString()
    );
    await comptroller._setCollateralFactor(
      cTokenBDelegator.address,
      parseUnits('0.5', 18).toString()
    );
    await comptroller._setLiquidationIncentive(
      parseUnits('1.08', 18).toString()
    );
    await comptroller._setCloseFactor(parseUnits('0.5', 18).toString());
    // TODO:
    // await cTokenBDelegator._setReserveFactor(
    //   parseUnits('1', 18).toString()
    // );

    snapshot = await helpers.takeSnapshot();
  });

  afterEach(async function () {
    await snapshot.restore();
  });

  // TODO:
  it('User1 使用 1 顆 token B 來 mint cToken', async function () {});

  // TODO:
  it('User1 使用 token B 作為抵押品來借出 50 顆 token A', async function () {});

  // TODO:
  it('調整 token A 的 collateral factor，讓 user1 被 user2 清算', async function () {});

  // TODO:
  it('調整 oracle 中的 token B 的價格，讓 user1 被 user2 清算', async function () {});
});
