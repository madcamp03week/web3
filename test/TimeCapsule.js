const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TimeCapsule", function () {
  let TimeCapsule;
  let timeCapsule;
  let owner;
  let recipient;
  let otherAccount;

  beforeEach(async function () {
    // 계정들 가져오기
    [owner, recipient, otherAccount] = await ethers.getSigners();

    // 컨트랙트 배포
    TimeCapsule = await ethers.getContractFactory("TimeCapsule");
    timeCapsule = await TimeCapsule.deploy(owner.address);
  });

  describe("배포", function () {
    it("올바른 이름과 심볼로 배포되어야 함", async function () {
      expect(await timeCapsule.name()).to.equal("TimeCapsule");
      expect(await timeCapsule.symbol()).to.equal("TCAP");
    });

    it("배포자가 owner로 설정되어야 함", async function () {
      expect(await timeCapsule.owner()).to.equal(owner.address);
    });
  });

  describe("캡슐 생성", function () {
    it("owner만 캡슐을 생성할 수 있어야 함", async function () {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1시간 후
      
      await expect(
        timeCapsule.connect(otherAccount).createCapsule(
          recipient.address,
          "Test Capsule",
          futureTimestamp,
          "ipfs://test-uri"
        )
      ).to.be.revertedWithCustomError(timeCapsule, "OwnableUnauthorizedAccount");
    });

    it("캡슐이 올바르게 생성되어야 함", async function () {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const title = "Test Capsule";
      const tokenURI = "ipfs://test-uri";

      await expect(
        timeCapsule.createCapsule(recipient.address, title, futureTimestamp, tokenURI)
      ).to.emit(timeCapsule, "CapsuleCreated")
        .withArgs(1, recipient.address, title, futureTimestamp);

      const capsule = await timeCapsule.timeCapsules(1);
      expect(capsule.recipient).to.equal(recipient.address);
      expect(capsule.title).to.equal(title);
      expect(capsule.openTimestamp).to.equal(futureTimestamp);
      expect(capsule.isOpen).to.be.false;
    });

    it("토큰 ID가 순차적으로 증가해야 함", async function () {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      
      await timeCapsule.createCapsule(
        recipient.address,
        "Capsule 1",
        futureTimestamp,
        "ipfs://uri1"
      );

      await timeCapsule.createCapsule(
        otherAccount.address,
        "Capsule 2",
        futureTimestamp,
        "ipfs://uri2"
      );

      const capsule1 = await timeCapsule.timeCapsules(1);
      const capsule2 = await timeCapsule.timeCapsules(2);
      
      expect(capsule1.recipient).to.equal(recipient.address);
      expect(capsule2.recipient).to.equal(otherAccount.address);
    });
  });

  describe("캡슐 열기", function () {
    let tokenId;
    let openTimestamp;

    beforeEach(async function () {
      // 현재 블록 타임스탬프를 기준으로 설정
      const currentBlock = await ethers.provider.getBlock("latest");
      openTimestamp = currentBlock.timestamp + 3600; // 1시간 후
      
      await timeCapsule.createCapsule(
        recipient.address,
        "Test Capsule",
        openTimestamp,
        "ipfs://test-uri"
      );
      
      tokenId = 1;
    });

    it("아직 시간이 되지 않았으면 열 수 없어야 함", async function () {
      await expect(
        timeCapsule.openCapsule(tokenId)
      ).to.be.revertedWith("TimeCapsule: It's not time yet.");
    });

    it("이미 열린 캡슐은 다시 열 수 없어야 함", async function () {
      // 시간을 미래로 설정
      await ethers.provider.send("evm_setNextBlockTimestamp", [openTimestamp + 10]);
      await ethers.provider.send("evm_mine");

      // 첫 번째로 열기
      await timeCapsule.openCapsule(tokenId);

      // 두 번째로 열기 시도
      await expect(
        timeCapsule.openCapsule(tokenId)
      ).to.be.revertedWith("TimeCapsule: Already opened.");
    });

    it("시간이 되면 캡슐을 열 수 있어야 함", async function () {
      // 시간을 미래로 설정
      await ethers.provider.send("evm_setNextBlockTimestamp", [openTimestamp + 10]);
      await ethers.provider.send("evm_mine");

      await expect(
        timeCapsule.openCapsule(tokenId)
      ).to.emit(timeCapsule, "CapsuleOpened")
        .withArgs(tokenId, recipient.address);

      const capsule = await timeCapsule.timeCapsules(tokenId);
      expect(capsule.isOpen).to.be.true;
    });

    it("캡슐이 열리면 NFT가 수신자에게 민팅되어야 함", async function () {
      // 시간을 미래로 설정
      await ethers.provider.send("evm_setNextBlockTimestamp", [openTimestamp + 10]);
      await ethers.provider.send("evm_mine");

      await timeCapsule.openCapsule(tokenId);

      expect(await timeCapsule.ownerOf(tokenId)).to.equal(recipient.address);
      expect(await timeCapsule.balanceOf(recipient.address)).to.equal(1);
    });
  });

  describe("토큰 URI", function () {
    it("캡슐이 열린 후 올바른 토큰 URI를 반환해야 함", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const futureTimestamp = currentBlock.timestamp + 3600;
      const tokenURI = "ipfs://test-uri";

      await timeCapsule.createCapsule(
        recipient.address,
        "Test Capsule",
        futureTimestamp,
        tokenURI
      );

      // 시간을 미래로 설정하고 캡슐 열기
      await ethers.provider.send("evm_setNextBlockTimestamp", [futureTimestamp + 10]);
      await ethers.provider.send("evm_mine");
      await timeCapsule.openCapsule(1);

      expect(await timeCapsule.tokenURI(1)).to.equal(tokenURI);
    });

    it("owner만 토큰 URI를 변경할 수 있어야 함", async function () {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      
      await timeCapsule.createCapsule(
        recipient.address,
        "Test Capsule",
        futureTimestamp,
        "ipfs://original-uri"
      );

      await expect(
        timeCapsule.connect(otherAccount).setTokenURI(1, "ipfs://new-uri")
      ).to.be.revertedWithCustomError(timeCapsule, "OwnableUnauthorizedAccount");
    });

    it("owner가 토큰 URI를 변경할 수 있어야 함", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const futureTimestamp = currentBlock.timestamp + 3600;
      
      await timeCapsule.createCapsule(
        recipient.address,
        "Test Capsule",
        futureTimestamp,
        "ipfs://original-uri"
      );

      const newURI = "ipfs://new-uri";
      await timeCapsule.setTokenURI(1, newURI);

      // 시간을 미래로 설정하고 캡슐 열기
      await ethers.provider.send("evm_setNextBlockTimestamp", [futureTimestamp + 10]);
      await ethers.provider.send("evm_mine");
      await timeCapsule.openCapsule(1);

      expect(await timeCapsule.tokenURI(1)).to.equal(newURI);
    });
  });

  describe("ERC721 기능", function () {
    it("supportsInterface가 올바르게 작동해야 함", async function () {
      // ERC721 인터페이스 ID
      const ERC721_INTERFACE_ID = "0x80ac58cd";
      // ERC721Metadata 인터페이스 ID
      const ERC721_METADATA_INTERFACE_ID = "0x5b5e139f";
      // ERC165 인터페이스 ID
      const ERC165_INTERFACE_ID = "0x01ffc9a7";

      expect(await timeCapsule.supportsInterface(ERC721_INTERFACE_ID)).to.be.true;
      expect(await timeCapsule.supportsInterface(ERC721_METADATA_INTERFACE_ID)).to.be.true;
      expect(await timeCapsule.supportsInterface(ERC165_INTERFACE_ID)).to.be.true;
      expect(await timeCapsule.supportsInterface("0x12345678")).to.be.false;
    });
  });
}); 