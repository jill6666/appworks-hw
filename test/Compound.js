const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('Compound', function () {
  let erc20;
  let cErc20;
  let comptroller;
  let interestRateModel;
  let accounts;

  /**
   * @param {String} supply default '0'
   * @param {Number} dicimal default 18
   * @returns
   */
  const getParseUnits = (supply = '0', dicimal = 18) => {
    return ethers.utils.parseUnits(supply, dicimal);
  };

  /**
   * @description log 出 user 擁有的 token balance
   * @param {String} userAddr
   * @param {String} token token name e.g. 'cErc20'
   */
  const logUserBalance = async (userAddr, token) => {
    const TOKEN_BALANCE = {
      erc20: ethers.utils.formatUnits(await erc20?.balanceOf(userAddr), 18),
      cErc20: ethers.utils.formatUnits(await cErc20?.balanceOf(userAddr), 18),
    };
    if (!TOKEN_BALANCE[token]) console.log(`[🙉 WARNING] no token support!`);

    console.log(
      `[🔍 INFO] balance of ${userAddr}: { ${token}: ${TOKEN_BALANCE[token]}}`
    );
  };

  it('部署 cErc20 需要的參數', async function () {
    /**
     * 部署 Comptroller
     * [題目]: 使用 SimplePriceOracle 作為 Oracle
     */
    const comptrollerFactory = await ethers.getContractFactory('Comptroller');
    comptroller = await comptrollerFactory?.deploy();
    await comptroller?.deployed();
    comptroller._setPriceOracle('SimplePriceOracle');

    console.log(
      `[✅ SUCCESS] comptroller deployed! {address: ${comptroller?.address}}`
    );

    /**
     * 部署 ERC20
     * [題目]: 需部署一個 CErc20 的 underlying ERC20 token，decimals 為 18
     */
    const erc20Factory = await ethers.getContractFactory('TestToken');
    erc20 = await erc20Factory?.deploy(
      getParseUnits('10000'),
      'MyToken',
      'mtk'
    );
    await erc20?.deployed();
    await erc20?.totalSupply();

    console.log(`[✅ SUCCESS] erc20 deployed! {address: ${erc20?.address}}`);

    /**
     * 部署 InterestRateModel
     */
    const interestRateModelFactory = await ethers.getContractFactory(
      'WhitePaperInterestRateModel'
    );
    /**
     * [題目]: 初始 exchangeRate 為 1:1
     * [題目]: 將利率模型合約中的借貸利率設定為 0% ❔
     */
    interestRateModel = await interestRateModelFactory?.deploy(
      getParseUnits(),
      getParseUnits()
    );
    await interestRateModel?.deployed();

    console.log(
      `[✅ SUCCESS] interestRateModel deployed! {address: ${interestRateModel?.address}}`
    );
  });
  it('部署 CErc20', async function () {
    /**
     * 部署 CErc20
     */
    accounts = await ethers.getSigners();
    const cErc20Factory = await ethers.getContractFactory('CErc20Immutable');
    cErc20 = await cErc20Factory.deploy(
      erc20?.address,
      comptroller?.address,
      interestRateModel?.address,
      getParseUnits('1'),
      'Compond test token',
      'cMytoken',
      18,
      accounts?.[0]?.address
    );
    await cErc20.deployed();

    console.log(`[✅ SUCCESS] cErc20 deployed! {address: ${cErc20?.address}}`);
  });
  it('should be able to mint/redeem with TestToken', async function () {
    /**
     * [題目]: User1 使用 100 顆（100 * 10^18） ERC20 去 mint 出 100 CErc20 token
     *        再用 100 CErc20 token redeem 回 100 顆 ERC20
     */

    /** 給 User1 1000 顆 MyToken */
    const user1 = accounts?.[1];
    const price = getParseUnits('1000');

    await erc20.transfer(user1?.address, price);
    await logUserBalance(user1?.address, 'erc20');

    expect(await erc20?.balanceOf(user1?.address)).to.equal(price);

    /**
     * 將 cErc20 加到 market list 裡
     * User1 approve 資產
     * User1 存 100 顆 MyToken 進去，換得 100 顆 cErc20 出來
     */
    await comptroller._supportMarket(cErc20?.address);
    await erc20.connect(user1).approve(cErc20?.address, getParseUnits('100'));
    await cErc20.connect(user1).mint(getParseUnits('100'));

    console.log(`[✅ SUCCESS] already mint`);

    expect(await erc20.balanceOf(user1?.address)).to.equal(
      getParseUnits('900')
    );
    expect(await cErc20.balanceOf(user1?.address)).to.equal(
      getParseUnits('100')
    );

    await logUserBalance(user1?.address, 'erc20');
    await logUserBalance(user1?.address, 'cErc20');

    /** user1 拿 100 顆 cErc20 token，換得並提領 100顆 MyToken 出來 */
    await cErc20.connect(user1).redeem(getParseUnits('100'));
    console.log(`[✅ SUCCESS] already redeem`);

    expect(await erc20.balanceOf(user1?.address)).to.equal(
      getParseUnits('1000')
    );
    expect(await cErc20.balanceOf(user1.address)).to.equal(getParseUnits('0'));

    await logUserBalance(user1?.address, 'erc20');
    await logUserBalance(user1?.address, 'cErc20');
  });
});
