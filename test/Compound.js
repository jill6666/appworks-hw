const { ethers } = require('hardhat');

describe('Compound', function () {
  describe('CErc20', function () {
    it('should be able to mint/redeem with TestToken', async function () {
      /**
       * 部署 cErc20 需要的參數
       */
      const getCErc20Params = async () => {
        /**
         * 部署 Comptroller
         */
        const comptrollerFactory = await ethers.getContractFactory(
          'Comptroller'
        );
        const comptroller = await comptrollerFactory?.deploy();
        await comptroller?.deployed();

        console.log('[✅ SUCCESS] comptroller address: ', comptroller?.address);
        /**
         * 部署 ERC20
         * [題目]: 需部署一個 CErc20 的 underlying ERC20 token，decimals 為 18
         */
        const erc20Factory = await ethers.getContractFactory('TestToken');
        const erc20 = await erc20Factory?.deploy(
          ethers.utils.parseUnits('10000', 18),
          'My token',
          'mtk'
        );
        await erc20?.deployed();

        console.log('[✅ SUCCESS] erc20 address: ', erc20?.address);

        /**
         * 部署 InterestRateModel
         */
        const interestRateModelFactory = await ethers.getContractFactory(
          'WhitePaperInterestRateModel'
        );
        /**
         * [題目]: 初始 exchangeRate 為 1:1
         * [題目]: 將利率模型合約中的借貸利率設定為 0%
         */
        const interestRateModel = await interestRateModelFactory?.deploy(
          ethers.utils.parseUnits('0', 18),
          ethers.utils.parseUnits('0', 18)
        );
        await interestRateModel?.deployed();

        console.log(
          '[✅ SUCCESS] interestRateModel address: ',
          interestRateModel?.address
        );

        return { comptroller, erc20, interestRateModel };
      };

      /**
       * 部署 CErc20
       */
      const cErc20Factory = await ethers.getContractFactory('CErc20');
      const cErc20 = await cErc20Factory.deploy();
      await cErc20.deployed();

      console.log('[✅ SUCCESS] cErc20 address: ', cErc20?.address);

      /**
       * initialize cErc20
       * 因為 CErc20 繼承 CToken 有兩個 Intializer要用 ["initialize..."] 的方式
       *
       * @notice Initialize the new money market
       * @param underlying_ The address of the underlying asset
       * @param comptroller_ The address of the Comptroller
       * @param interestRateModel_ The address of the interest rate model
       * @param initialExchangeRateMantissa_ The initial exchange rate, scaled by 1e18
       * @param name_ ERC-20 name of this token
       * @param symbol_ ERC-20 symbol of this token
       * @param decimals_ ERC-20 decimal precision of this token
       */
      const { comptroller, erc20, interestRateModel } = await getCErc20Params();
      await cErc20[
        'initialize(address,address,address,uint256,string,string,uint8)'
      ](
        erc20?.address,
        comptroller?.address,
        interestRateModel?.address,
        ethers.utils.parseUnits('1', 18),
        'Compond test token',
        'cMytoken',
        18
      );

      /**
       * TODO:  SimplePriceOracle, mint/ redeem
       * [題目]: 使用 SimplePriceOracle 作為 Oracle
       * [題目]: User1 使用 100 顆（100 * 10^18） ERC20 去 mint 出 100 CErc20 token
       *        再用 100 CErc20 token redeem 回 100 顆 ERC20
       */
      const SimplePriceOracleFactory = await ethers.getContractFactory(
        'SimplePriceOracle'
      );
      const priceOracle = await SimplePriceOracleFactory.deploy();
      await priceOracle.deployed();
    });
  });
});
