import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import Bignumber from 'bignumber.js';

const DECIMAL = 10n ** 18n;

/**
 * 部署一個 CErc20(CErc20.sol)
 */
describe('Compound', function () {
  async function deployERC20(name, symbol) {
    const TestToken = await ethers.getContractFactory('TestToken');
    const testToken = await TestToken.deploy(name, symbol);

    return testToken;
  }

  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployERC20Fixture() {
    const [owner, ...otherAccount] = await ethers.getSigners();

    const testToken = await deployERC20('TestToken', 'TT');

    return { owner, otherAccount, testToken };
  }

  async function deployCErc20(
    name,
    symbol,
    comptroller,
    interestRateModel,
    owner
  ) {
    const testToken = await deployERC20(name, symbol);
    // Setup CErc20Delegate implementation
    const CErc20TokenDelegate = await ethers.getContractFactory(
      'CErc20Delegate'
    );
    const cErc20TokenDelegate = await CErc20TokenDelegate.deploy();

    const CErc20TokenDelegator = await ethers.getContractFactory(
      'CErc20Delegator'
    );
    const cErc20Token = await CErc20TokenDelegator.deploy(
      testToken.address,
      comptroller.address,
      interestRateModel.address,
      1n * DECIMAL,
      `c${name}`,
      `c${symbol}`,
      18,
      owner.address,
      cErc20TokenDelegate.address,
      '0x00'
    );

    // cErc20TokenDelegate for check error
    return { testToken, cErc20Token, cErc20TokenDelegate };
  }

  async function deployControllerFixture() {
    // Setup Comptroller
    const ComptrollerContract = await ethers.getContractFactory('Comptroller');
    const comptrollerContract = await ComptrollerContract.deploy();

    const UnitrollerContract = await ethers.getContractFactory('Unitroller');
    const unitrollerContract = await UnitrollerContract.deploy();

    // Unitroller Setup implementation
    await unitrollerContract._setPendingImplementation(
      comptrollerContract.address
    );
    await comptrollerContract._become(unitrollerContract.address);

    // Setup Unitroller Proxy let hardhat counld work
    const unitrollerProxy = await comptrollerContract.attach(
      unitrollerContract.address
    );

    // Setup Oracle
    const SimplePriceOracleContract = await ethers.getContractFactory(
      'SimplePriceOracle'
    );
    const priceOracle = await SimplePriceOracleContract.deploy();

    await unitrollerProxy._setPriceOracle(priceOracle.address);

    return { unitrollerProxy, priceOracle };
  }

  async function deployCompoundFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, ...otherAccount] = await ethers.getSigners();

    // Setup Controller
    const { unitrollerProxy, priceOracle } = await deployControllerFixture();

    // Setup InterestRateModel
    const ZeroInterestRateModelContract = await ethers.getContractFactory(
      'ZeroInterestRateModel'
    );
    const interestRateModel = await ZeroInterestRateModelContract.deploy();

    // Setup CErc20Delegate and Erc20 TestToken
    // Setup TestTokenA Market
    const { testToken, cErc20Token, cErc20TokenDelegate } = await deployCErc20(
      'TestTokenA',
      'TTA',
      unitrollerProxy,
      interestRateModel,
      owner
    );

    await unitrollerProxy._supportMarket(cErc20Token.address);

    return {
      owner,
      otherAccount,
      testTokenA: testToken,
      cErc20TokenA: cErc20Token,
      cErc20TokenADelegate: cErc20TokenDelegate,
      unitrollerProxy,
      priceOracle,
      interestRateModel,
    };
  }

  async function deployCompoundWithMultiMarketFixture() {
    const compound = await deployCompoundFixture();

    const { unitrollerProxy, interestRateModel, owner } = compound;

    // Setup TestTokenB Market
    const { testToken, cErc20Token, cErc20TokenDelegate } = await deployCErc20(
      'TestTokenB',
      'TTB',
      unitrollerProxy,
      interestRateModel,
      owner
    );

    await unitrollerProxy._supportMarket(cErc20Token.address);

    return {
      ...compound,
      testTokenB: testToken,
      cErc20TokenB: cErc20Token,
      cErc20TokenBDelegate: cErc20TokenDelegate,
    };
  }

  describe('Deployment', function () {
    it('Should set the right admin', async function () {
      const { owner, unitrollerProxy } = await loadFixture(
        deployCompoundFixture
      );
      expect(await unitrollerProxy.admin()).to.equal(owner.address);
    });

    it('Should have TestToken', async function () {
      const { owner, testToken } = await loadFixture(deployERC20Fixture);
      const balance = await testToken.balanceOf(owner.address);
      expect(balance).to.equal(100000000n * DECIMAL);
    });
  });

  describe('mint/redeem', function () {
    it('Should mint CErc20 Token by TestToken', async function () {
      const { owner, testTokenA, cErc20TokenA } = await loadFixture(
        deployCompoundFixture
      );

      const MINT_AMOUNT = 100n * DECIMAL;

      await testTokenA.approve(cErc20TokenA.address, MINT_AMOUNT);

      await cErc20TokenA.mint(MINT_AMOUNT);

      const contractBalance = await testTokenA.balanceOf(cErc20TokenA.address);

      // owner's cErc20 token balance === MINT_AMOUNT
      const balance = await cErc20TokenA.balanceOf(owner.address);

      expect(contractBalance).to.equal(MINT_AMOUNT);
      expect(balance).to.equal(MINT_AMOUNT);
    });

    it('Should redeem CErc20 Token and get TestToken', async function () {
      const { owner, testTokenA, cErc20TokenA } = await loadFixture(
        deployCompoundFixture
      );

      const MINT_AMOUNT = 100n * DECIMAL;

      await testTokenA.approve(cErc20TokenA.address, MINT_AMOUNT);

      await cErc20TokenA.mint(MINT_AMOUNT);

      await cErc20TokenA.approve(owner.address, MINT_AMOUNT);

      // owner's testTokenA increase, cErc20TokenA's testTokenA decrease
      await expect(cErc20TokenA.redeem(MINT_AMOUNT)).to.changeTokenBalances(
        testTokenA,
        [owner, cErc20TokenA],
        [MINT_AMOUNT, -MINT_AMOUNT]
      );

      // owner's cErc20 token should be 0
      const balance = await cErc20TokenA.balanceOf(owner.address);

      expect(balance).to.equal(0);
    });
  });

  describe('borrow/repay', function () {
    async function setupBorrowRepayFixture() {
      const compound = await deployCompoundWithMultiMarketFixture();

      const { priceOracle, cErc20TokenA, cErc20TokenB, unitrollerProxy } =
        compound;

      const TESTTOKENA_PRICE = 1n * DECIMAL;
      const TESTTOKENB_PRICE = 100n * DECIMAL;
      const COLLATERAL_FACTOR = new Bignumber(0.5)
        .multipliedBy(DECIMAL.toString())
        .toString();

      // Controller Setup Price: testTokenA = $1, testTokenB = $100
      await priceOracle.setUnderlyingPrice(
        cErc20TokenA.address,
        TESTTOKENA_PRICE
      );
      await priceOracle.setUnderlyingPrice(
        cErc20TokenB.address,
        TESTTOKENB_PRICE
      );

      // Controller Setup Collateral factor: testTokenB 50% = 0.5
      await unitrollerProxy._setCollateralFactor(
        cErc20TokenB.address,
        COLLATERAL_FACTOR
      );

      return { ...compound, COLLATERAL_FACTOR };
    }

    it('Should setup TestTokenB collateral factor', async function () {
      const { cErc20TokenB, unitrollerProxy, COLLATERAL_FACTOR } =
        await loadFixture(setupBorrowRepayFixture);

      const market = await unitrollerProxy.markets(cErc20TokenB.address);

      expect(market.collateralFactorMantissa).to.equal(COLLATERAL_FACTOR);
    });

    it('Should borrow TestTokenA when TestTokenB as collateral', async function () {
      const {
        owner,
        testTokenA,
        cErc20TokenA,
        testTokenB,
        cErc20TokenB,
        unitrollerProxy,
      } = await loadFixture(setupBorrowRepayFixture);

      // User Setup asset enter market as collateral (by user)
      await unitrollerProxy.enterMarkets([
        cErc20TokenA.address,
        cErc20TokenB.address,
      ]);

      const assets = await unitrollerProxy.getAssetsIn(owner.address);

      // check asset can be as collateral
      expect(assets).to.eqls([cErc20TokenA.address, cErc20TokenB.address]);

      // User Setup deposit: testTokenA 100
      const TESTTOKENA_DEPOSIT_AMOUNT = 100n * DECIMAL;
      await testTokenA.approve(cErc20TokenA.address, TESTTOKENA_DEPOSIT_AMOUNT);
      await cErc20TokenA.mint(TESTTOKENA_DEPOSIT_AMOUNT);

      // Mint 1 cErc20TokenB by 1 testTokenB
      const TESTTOKENB_DEPOSIT_AMOUNT = 1n * DECIMAL;
      await testTokenB.approve(cErc20TokenB.address, TESTTOKENB_DEPOSIT_AMOUNT);
      await cErc20TokenB.mint(TESTTOKENB_DEPOSIT_AMOUNT);

      const TESTTOKENA_BORROW_AMOUNT = 50n * DECIMAL;

      await expect(
        cErc20TokenA.borrow(TESTTOKENA_BORROW_AMOUNT)
      ).to.changeTokenBalances(
        testTokenA,
        [owner, cErc20TokenA],
        [TESTTOKENA_BORROW_AMOUNT, -TESTTOKENA_BORROW_AMOUNT]
      );

      const balance = await testTokenA.balanceOf(owner.address);

      // owner's testTokenA balance === Original - deposit + borrow
      expect(balance).to.equal((100000000n - 100n + 50n) * DECIMAL);
    });

    it('Could repay patial TestTokenA after borrow', async function () {
      const {
        owner,
        testTokenA,
        cErc20TokenA,
        testTokenB,
        cErc20TokenB,
        unitrollerProxy,
      } = await loadFixture(setupBorrowRepayFixture);

      // User Setup asset enter market as collateral (by user)
      await unitrollerProxy.enterMarkets([
        cErc20TokenA.address,
        cErc20TokenB.address,
      ]);

      // User Setup deposit: testTokenA 100
      const TESTTOKENA_DEPOSIT_AMOUNT = 100n * DECIMAL;
      await testTokenA.approve(cErc20TokenA.address, TESTTOKENA_DEPOSIT_AMOUNT);
      await cErc20TokenA.mint(TESTTOKENA_DEPOSIT_AMOUNT);

      // Mint 1 cErc20TokenB by 1 testTokenB
      const TESTTOKENB_DEPOSIT_AMOUNT = 1n * DECIMAL;
      await testTokenB.approve(cErc20TokenB.address, TESTTOKENB_DEPOSIT_AMOUNT);
      await cErc20TokenB.mint(TESTTOKENB_DEPOSIT_AMOUNT);

      const TESTTOKENA_BORROW_AMOUNT = 50n * DECIMAL;
      await cErc20TokenA.borrow(TESTTOKENA_BORROW_AMOUNT);

      const TESTTOKENA_REPAY_BORROW_AMOUNT = 25n * DECIMAL;

      await testTokenA.approve(
        cErc20TokenA.address,
        TESTTOKENA_REPAY_BORROW_AMOUNT
      );

      // owner's testTokenA decrease, cErc20TokenA's testTokenA increase
      await expect(
        cErc20TokenA.repayBorrow(TESTTOKENA_REPAY_BORROW_AMOUNT)
      ).to.changeTokenBalances(
        testTokenA,
        [owner, cErc20TokenA],
        [-TESTTOKENA_REPAY_BORROW_AMOUNT, TESTTOKENA_REPAY_BORROW_AMOUNT]
      );

      const balance = await testTokenA.balanceOf(owner.address);

      // owner's testTokenA balance === Original - deposit + borrow - repay
      expect(balance).to.equal((100000000n - 100n + 50n - 25n) * DECIMAL);
    });

    it('Should not withdraw all TestTokenB if has debt', async function () {
      const {
        owner,
        testTokenA,
        cErc20TokenA,
        testTokenB,
        cErc20TokenB,
        cErc20TokenBDelegate,
        unitrollerProxy,
      } = await loadFixture(setupBorrowRepayFixture);

      // User Setup asset enter market as collateral (by user)
      await unitrollerProxy.enterMarkets([
        cErc20TokenA.address,
        cErc20TokenB.address,
      ]);

      // User Setup deposit: testTokenA 100
      const TESTTOKENA_DEPOSIT_AMOUNT = 100n * DECIMAL;

      await testTokenA.approve(cErc20TokenA.address, TESTTOKENA_DEPOSIT_AMOUNT);
      await cErc20TokenA.mint(TESTTOKENA_DEPOSIT_AMOUNT);

      // Mint 1 cErc20TokenB by 1 testTokenB
      const TESTTOKENB_DEPOSIT_AMOUNT = 1n * DECIMAL;

      await testTokenB.approve(cErc20TokenB.address, TESTTOKENB_DEPOSIT_AMOUNT);
      await cErc20TokenB.mint(TESTTOKENB_DEPOSIT_AMOUNT);

      const TESTTOKENA_BORROW_AMOUNT = 50n * DECIMAL;
      await cErc20TokenA.borrow(TESTTOKENA_BORROW_AMOUNT);

      await cErc20TokenB.approve(owner.address, TESTTOKENB_DEPOSIT_AMOUNT);

      await expect(
        cErc20TokenB.redeem(TESTTOKENB_DEPOSIT_AMOUNT)
      ).to.be.revertedWithCustomError(
        cErc20TokenBDelegate,
        'RedeemComptrollerRejection'
      );
    });

    it('Could repay all TestTokenA after borrow', async function () {
      const {
        owner,
        testTokenA,
        cErc20TokenA,
        testTokenB,
        cErc20TokenB,
        unitrollerProxy,
      } = await loadFixture(setupBorrowRepayFixture);

      // User Setup asset enter market as collateral (by user)
      await unitrollerProxy.enterMarkets([
        cErc20TokenA.address,
        cErc20TokenB.address,
      ]);

      // User Setup deposit: testTokenA 100
      const TESTTOKENA_DEPOSIT_AMOUNT = 100n * DECIMAL;
      await testTokenA.approve(cErc20TokenA.address, TESTTOKENA_DEPOSIT_AMOUNT);
      await cErc20TokenA.mint(TESTTOKENA_DEPOSIT_AMOUNT);

      // Mint 1 cErc20TokenB by 1 testTokenB
      const TESTTOKENB_DEPOSIT_AMOUNT = 1n * DECIMAL;
      await testTokenB.approve(cErc20TokenB.address, TESTTOKENB_DEPOSIT_AMOUNT);
      await cErc20TokenB.mint(TESTTOKENB_DEPOSIT_AMOUNT);

      const TESTTOKENA_BORROW_AMOUNT = 50n * DECIMAL;
      await cErc20TokenA.borrow(TESTTOKENA_BORROW_AMOUNT);

      await testTokenA.approve(cErc20TokenA.address, TESTTOKENA_BORROW_AMOUNT);

      // owner's testTokenA decrease, cErc20TokenA's testTokenA increase
      await expect(
        cErc20TokenA.repayBorrow(TESTTOKENA_BORROW_AMOUNT)
      ).to.changeTokenBalances(
        testTokenA,
        [owner, cErc20TokenA],
        [-TESTTOKENA_BORROW_AMOUNT, TESTTOKENA_BORROW_AMOUNT]
      );

      const balance = await testTokenA.balanceOf(owner.address);

      // owner's testTokenA balance === Original - deposit
      expect(balance).to.equal((100000000n - 100n) * DECIMAL);
    });

    it('Chould withdraw all TestTokenB if has no debt', async function () {
      const {
        owner,
        testTokenA,
        cErc20TokenA,
        testTokenB,
        cErc20TokenB,
        unitrollerProxy,
      } = await loadFixture(setupBorrowRepayFixture);

      // User Setup asset enter market as collateral (by user)
      await unitrollerProxy.enterMarkets([
        cErc20TokenA.address,
        cErc20TokenB.address,
      ]);

      // User Setup deposit: testTokenA 100
      const TESTTOKENA_DEPOSIT_AMOUNT = 100n * DECIMAL;
      await testTokenA.approve(cErc20TokenA.address, TESTTOKENA_DEPOSIT_AMOUNT);
      await cErc20TokenA.mint(TESTTOKENA_DEPOSIT_AMOUNT);

      // Mint 1 cErc20TokenB by 1 testTokenB
      const TESTTOKENB_DEPOSIT_AMOUNT = 1n * DECIMAL;
      await testTokenB.approve(cErc20TokenB.address, TESTTOKENB_DEPOSIT_AMOUNT);
      await cErc20TokenB.mint(TESTTOKENB_DEPOSIT_AMOUNT);

      const TESTTOKENA_BORROW_AMOUNT = 50n * DECIMAL;
      await cErc20TokenA.borrow(TESTTOKENA_BORROW_AMOUNT);

      await testTokenA.approve(cErc20TokenA.address, TESTTOKENA_BORROW_AMOUNT);

      // owner's testTokenA decrease, cErc20TokenA's testTokenA increase
      await cErc20TokenA.repayBorrow(TESTTOKENA_BORROW_AMOUNT);

      await cErc20TokenB.approve(owner.address, TESTTOKENB_DEPOSIT_AMOUNT);

      // owner's testTokenA decrease, cErc20TokenA's testTokenA increase
      await expect(
        cErc20TokenB.redeem(TESTTOKENB_DEPOSIT_AMOUNT)
      ).to.changeTokenBalances(
        testTokenB,
        [owner, cErc20TokenB],
        [TESTTOKENB_DEPOSIT_AMOUNT, -TESTTOKENB_DEPOSIT_AMOUNT]
      );
    });
  });
});
