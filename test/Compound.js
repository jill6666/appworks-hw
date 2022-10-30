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
      const { comptroller, erc20, interestRateModel } = await getCErc20Params();

      /**
       * 部署 CErc20
       */
      const accounts = await ethers.getSigners();
      const cErc20Factory = await ethers.getContractFactory('CErc20Immutable');
      const cErc20 = await cErc20Factory.deploy(
        erc20?.address,
        comptroller?.address,
        interestRateModel?.address,
        ethers.utils.parseUnits('1', 18),
        'Compond test token',
        'cMytoken',
        18,
        accounts?.[0]?.address
      );
      await cErc20.deployed();

      console.log('[✅ SUCCESS] cErc20 address: ', cErc20?.address);

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
