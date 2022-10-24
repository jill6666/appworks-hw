// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const { ethers, upgrades } = require('hardhat');
async function main() {
  try {
    const [deployer] = await ethers.getSigners();
    console.log(
      `💘💘💘[INFO]: ${deployer.address} is deploying the contract ~~ 😇😇😇`
    );

    const NFT = await ethers.getContractFactory('NFT');
    console.log(`💘💘💘[INFO]: ready for deploy proxyNFT ~~ 😇😇😇`);
    const proxyNFT = await upgrades.deployProxy(NFT);
    await proxyNFT.deployed();

    console.log('Proxy 合約地址', proxyNFT.address);
    console.log(
      '管理合約地址 getAdminAddress',
      await upgrades.erc1967.getAdminAddress(proxyNFT.address)
    );
    console.log(
      '邏輯合約地址 getImplementationAddress',
      await upgrades.erc1967.getImplementationAddress(proxyNFT.address)
    );

    console.log(
      `✅✅✅[SUCCESS]: NFT contract deployed to ${proxyNFT.address} ~~ 😇😇😇`
    );
  } catch (error) {
    console.error('🙉🙉🙉[ERROR]: ', error);
    process.exitCode = 1;
  }
}

main();
