// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const { ethers, upgrades } = require('hardhat');

async function main() {
  try {
    /**  */
    const NFT = await ethers.getContractFactory('NFT');
    const proxyNFT = await upgrades.deployProxy(NFT);

    await proxyNFT.deployed();

    console.log(
      `✅[SUCCESS]: NFT contract deployed to ${proxyNFT.address} ~~ 😇😇😇`
    );
  } catch (error) {
    console.error('🙉🙉🙉 [ERROR]: ', error);
    process.exitCode = 1;
  }
}

main();
