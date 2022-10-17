// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract NFT is Initializable, ERC721Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
  using StringsUpgradeable for uint256;

  using CountersUpgradeable for CountersUpgradeable.Counter;
  CountersUpgradeable.Counter private _nextTokenId;

  uint256 public price;
  uint256 public constant maxSupply = 100;
 
  bool public mintActive;
  bool public earlyMintActive;
  bool public revealed;
  
  string public baseURI;
  bytes32 public merkleRoot;
  bytes32 public leaf;
  uint256 public userMintLimit;

  mapping(uint256 => string) private _tokenURIs;
  mapping(address => uint256) public addressMintedBalance;
  mapping(address => bool) public whitelistClaimed;
  
  function initialize() initializer public{
    __ERC721_init("AppWorks", "AW");
    __Ownable_init();
    __UUPSUpgradeable_init();

    price = 0.01 ether;

    mintActive = false;
    earlyMintActive = false;
    revealed = false;

    userMintLimit = msg.sender == owner()? 20 : 10;
    leaf = keccak256(abi.encodePacked(msg.sender));
  }


  // Public mint function - week 8
  function mint(uint256 _mintAmount) public payable {
    //Please make sure you check the following things:

    //Current state is available for Public Mint
    require(mintActive, "oops! state is not available for mint :-( ");

    //Check how many NFTs are available to be minted
    require(maxSupply >= _nextTokenId.current() + _mintAmount, "mint amount is not available :-( ");

    //Check user has sufficient funds
    require(msg.value >= _mintAmount * price, "so sad, you are not rich enough :-( ");

    addressMintedBalance[msg.sender] += _mintAmount;
    for (uint i = 0; i < _mintAmount; i++) {
        _safeMint(msg.sender, _nextTokenId.current());
      _nextTokenId.increment();
    }
  }
  
  // Implement totalSupply() Function to return current total NFT being minted - week 8
  function totalSupply() public view returns(uint) {
    // being minted
    return _nextTokenId.current();
  }

  // Implement withdrawBalance() Function to withdraw funds from the contract - week 8
  function withdrawBalance(uint256 _amount) external onlyOwner returns(bool result, uint256 balance) {
    (bool success,) = msg.sender.call{value: _amount}("");
    require(success, "fail to withdraw balance :-( ");

    return (success, address(this).balance);
  }
  
  // Implement setPrice(price) Function to set the mint price - week 8
  function setPrice(uint256 _newPrice) public onlyOwner {
    price = _newPrice;
  }
 
  // Implement toggleMint() Function to toggle the public mint available or not - week 8
  function toggleMint() public onlyOwner {
    mintActive = !mintActive;
  }

  // Set mint per user limit to 10 and owner limit to 20 - Week 8

  modifier mintLimit(uint256 _mintAmount) {
      require(_mintAmount > 0, "mintAmount must larger than 0");
      require(addressMintedBalance[msg.sender] + _mintAmount <= userMintLimit, "mint amount must less than limit");
      
      _;
  }

  // Implement toggleReveal() Function to toggle the blind box is revealed - week 9
  function toggleReveal() external onlyOwner {
      revealed = !revealed;
  }

  // Implement setBaseURI(newBaseURI) Function to set BaseURI - week 9
  function setBaseURI(string memory _newBaseURI) external onlyOwner {
      baseURI = _newBaseURI;
  }

  // Function to return the base URI
  function _baseURI() internal view virtual override returns (string memory) {
    return baseURI;
  }

  // Early mint function for people on the whitelist - week 9
  function earlyMint(bytes32[] calldata _merkleProof, uint256 _mintAmount) public payable {
    //Please make sure you check the following things:
    //Current state is available for Early Mint
    require(earlyMintActive, "not available for public mint currently");

    //Check how many NFTs are available to be minted
    require(_nextTokenId.current() + _mintAmount <= maxSupply, "no more token suppliy");

    //Check user has sufficient funds
    require(_mintAmount > 0, "amount should be more than 0");
    require(msg.value >= _mintAmount * price, "value is not enough");
    
    //Check user is in the whitelist - use merkle tree to validate
    require (!whitelistClaimed[msg.sender], "Alreadly claimed!");
    require(MerkleProof.verify(_merkleProof, merkleRoot, leaf), "not in whitelist");
    
    whitelistClaimed[msg.sender] = true;
    for (uint256 i = 0; i < _mintAmount; i++) {
      _safeMint(msg.sender, _nextTokenId.current());
      _nextTokenId.increment();
    }
  }
  
  // Implement toggleEarlyMint() Function to toggle the early mint available or not - week 9
  function toggleEarlyMint() external onlyOwner {
      earlyMintActive = !earlyMintActive;
  }

  // Implement setMerkleRoot(merkleRoot) Function to set new merkle root - week 9
  function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
      merkleRoot = _merkleRoot;
  }

  // Let this contract can be upgradable, using openzepplin proxy library - week 10
  // Try to modify blind box images by using proxy 
  function _authorizeUpgrade(address) internal override onlyOwner {}
}