const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TimeCapsule", function () {
  let TimeCapsule;
  let timeCapsule;
  let owner;
  let recipient1;
  let recipient2;
  let otherAccount;

  beforeEach(async function () {
    // 계정들 가져오기
    [owner, recipient1, recipient2, otherAccount] = await ethers.getSigners();

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
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      
      await expect(
        timeCapsule.connect(otherAccount).createCapsule(
          [recipient1.address],
          "Test Capsule",
          "Test Description",
          futureTimestamp,
          "ipfs://test-unopened-uri",
          "ipfs://test-opened-uri"
        )
      ).to.be.revertedWithCustomError(timeCapsule, "OwnableUnauthorizedAccount");
    });

    it("단일 수신자로 캡슐이 올바르게 생성되어야 함", async function () {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const title = "Test Capsule";
      const description = "Test Description";
      const unopenedIpfsMetadataCid = "ipfs://test-unopened-uri";
      const openedIpfsMetadataCid = "ipfs://test-opened-uri";
      const recipients = [recipient1.address];

      await expect(
        timeCapsule.createCapsule(recipients, title, description, futureTimestamp, unopenedIpfsMetadataCid, openedIpfsMetadataCid)
      ).to.emit(timeCapsule, "CapsuleCreated")
        .withArgs(1, 1, owner.address, recipients, title, futureTimestamp, unopenedIpfsMetadataCid);

      // CapsuleContent 확인
      const capsuleContent = await timeCapsule.capsuleContents(1);
      expect(capsuleContent.creator).to.equal(owner.address);
      expect(capsuleContent.title).to.equal(title);
      expect(capsuleContent.description).to.equal(description);
      expect(capsuleContent.openTimestamp).to.equal(futureTimestamp);
      expect(capsuleContent.unopenedIpfsMetadataCid).to.equal(unopenedIpfsMetadataCid);
      expect(capsuleContent.openedIpfsMetadataCid).to.equal(openedIpfsMetadataCid);

      // 토큰 매핑 확인
      expect(await timeCapsule.tokenIdToCapsuleContentId(1)).to.equal(1);
      expect(await timeCapsule.isCapsuleOpenedForToken(1)).to.be.false;

      // NFT 소유권 확인
      expect(await timeCapsule.ownerOf(1)).to.equal(recipient1.address);
      expect(await timeCapsule.tokenURI(1)).to.equal(unopenedIpfsMetadataCid);
    });

    it("여러 수신자로 캡슐이 올바르게 생성되어야 함", async function () {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const title = "Multi Recipient Capsule";
      const description = "Test Description";
      const unopenedIpfsMetadataCid = "ipfs://test-unopened-uri";
      const openedIpfsMetadataCid = "ipfs://test-opened-uri";
      const recipients = [recipient1.address, recipient2.address];

      await expect(
        timeCapsule.createCapsule(recipients, title, description, futureTimestamp, unopenedIpfsMetadataCid, openedIpfsMetadataCid)
      ).to.emit(timeCapsule, "CapsuleCreated")
        .withArgs(1, 1, owner.address, recipients, title, futureTimestamp, unopenedIpfsMetadataCid);

      // 각 수신자에게 NFT가 민팅되었는지 확인
      expect(await timeCapsule.ownerOf(1)).to.equal(recipient1.address);
      expect(await timeCapsule.ownerOf(2)).to.equal(recipient2.address);
      expect(await timeCapsule.tokenURI(1)).to.equal(unopenedIpfsMetadataCid);
      expect(await timeCapsule.tokenURI(2)).to.equal(unopenedIpfsMetadataCid);

      // 모든 토큰이 같은 CapsuleContent를 참조하는지 확인
      expect(await timeCapsule.tokenIdToCapsuleContentId(1)).to.equal(1);
      expect(await timeCapsule.tokenIdToCapsuleContentId(2)).to.equal(1);
    });

    it("토큰 ID가 순차적으로 증가해야 함", async function () {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      
      await timeCapsule.createCapsule(
        [recipient1.address],
        "Capsule 1",
        "Description 1",
        futureTimestamp,
        "ipfs://uri1-unopened",
        "ipfs://uri1-opened"
      );

      await timeCapsule.createCapsule(
        [recipient2.address],
        "Capsule 2",
        "Description 2",
        futureTimestamp,
        "ipfs://uri2-unopened",
        "ipfs://uri2-opened"
      );

      const capsuleContent1 = await timeCapsule.capsuleContents(1);
      const capsuleContent2 = await timeCapsule.capsuleContents(2);
      
      expect(capsuleContent1.creator).to.equal(owner.address);
      expect(capsuleContent2.creator).to.equal(owner.address);
      expect(await timeCapsule.ownerOf(1)).to.equal(recipient1.address);
      expect(await timeCapsule.ownerOf(2)).to.equal(recipient2.address);
    });

    it("과거 타임스탬프로 캡슐을 생성할 수 없어야 함", async function () {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1시간 전
      
      await expect(
        timeCapsule.createCapsule(
          [recipient1.address],
          "Test Capsule",
          "Test Description",
          pastTimestamp,
          "ipfs://test-unopened-uri",
          "ipfs://test-opened-uri"
        )
      ).to.be.revertedWith("TimeCapsule: Open timestamp must be in the future.");
    });

    it("빈 메타데이터 CID로 캡슐을 생성할 수 없어야 함", async function () {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      
      // 빈 unopened CID
      await expect(
        timeCapsule.createCapsule(
          [recipient1.address],
          "Test Capsule",
          "Test Description",
          futureTimestamp,
          "",
          "ipfs://test-opened-uri"
        )
      ).to.be.revertedWith("TimeCapsule: Unopened metadata CID cannot be empty.");

      // 빈 opened CID
      await expect(
        timeCapsule.createCapsule(
          [recipient1.address],
          "Test Capsule",
          "Test Description",
          futureTimestamp,
          "ipfs://test-unopened-uri",
          ""
        )
      ).to.be.revertedWith("TimeCapsule: Opened metadata CID cannot be empty.");
    });

    it("빈 수신자 배열로 캡슐을 생성할 수 없어야 함", async function () {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      
      await expect(
        timeCapsule.createCapsule(
          [],
          "Test Capsule",
          "Test Description",
          futureTimestamp,
          "ipfs://test-unopened-uri",
          "ipfs://test-opened-uri"
        )
      ).to.be.revertedWith("TimeCapsule: Recipients array cannot be empty.");
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
        [recipient1.address],
        "Test Capsule",
        "Test Description",
        openTimestamp,
        "ipfs://test-unopened-uri",
        "ipfs://test-opened-uri"
      );
      
      tokenId = 1;
    });

    it("아직 시간이 되지 않았으면 열 수 없어야 함", async function () {
      await expect(
        timeCapsule.connect(recipient1).openCapsule(tokenId)
      ).to.be.revertedWith("TimeCapsule: It's not time yet.");
    });

    it("이미 열린 캡슐은 다시 열 수 없어야 함", async function () {
      // 시간을 미래로 설정
      await ethers.provider.send("evm_setNextBlockTimestamp", [openTimestamp + 10]);
      await ethers.provider.send("evm_mine");

      // 첫 번째로 열기
      await timeCapsule.connect(recipient1).openCapsule(tokenId);

      // 두 번째로 열기 시도
      await expect(
        timeCapsule.connect(recipient1).openCapsule(tokenId)
      ).to.be.revertedWith("TimeCapsule: This token is already opened.");
    });

    it("시간이 되면 캡슐을 열 수 있어야 함", async function () {
      // 시간을 미래로 설정
      await ethers.provider.send("evm_setNextBlockTimestamp", [openTimestamp + 10]);
      await ethers.provider.send("evm_mine");

      await expect(
        timeCapsule.connect(recipient1).openCapsule(tokenId)
      ).to.emit(timeCapsule, "CapsuleOpened")
        .withArgs(tokenId, 1, recipient1.address, recipient1.address);

      expect(await timeCapsule.isCapsuleOpenedForToken(tokenId)).to.be.true;
    });

    it("캡슐이 열리면 NFT 메타데이터가 변경되어야 함", async function () {
      // 시간을 미래로 설정
      await ethers.provider.send("evm_setNextBlockTimestamp", [openTimestamp + 10]);
      await ethers.provider.send("evm_mine");

      // 열기 전 상태 확인
      expect(await timeCapsule.tokenURI(tokenId)).to.equal("ipfs://test-unopened-uri");

      await timeCapsule.connect(recipient1).openCapsule(tokenId);

      // 열린 후 상태 확인
      expect(await timeCapsule.tokenURI(tokenId)).to.equal("ipfs://test-opened-uri");
      expect(await timeCapsule.isCapsuleOpenedForToken(tokenId)).to.be.true;
    });

    it("NFT 소유자가 아닌 주소는 캡슐을 열 수 없어야 함", async function () {
      // 시간을 미래로 설정
      await ethers.provider.send("evm_setNextBlockTimestamp", [openTimestamp + 10]);
      await ethers.provider.send("evm_mine");

      await expect(
        timeCapsule.connect(otherAccount).openCapsule(tokenId)
      ).to.be.revertedWith("TimeCapsule: Caller is not owner nor approved.");
    });

    it("승인된 주소는 캡슐을 열 수 있어야 함", async function () {
      // 시간을 미래로 설정
      await ethers.provider.send("evm_setNextBlockTimestamp", [openTimestamp + 10]);
      await ethers.provider.send("evm_mine");

      // NFT 소유자가 다른 주소에게 승인
      await timeCapsule.connect(recipient1).approve(otherAccount.address, tokenId);

      await expect(
        timeCapsule.connect(otherAccount).openCapsule(tokenId)
      ).to.emit(timeCapsule, "CapsuleOpened")
        .withArgs(tokenId, 1, otherAccount.address, recipient1.address);

      expect(await timeCapsule.isCapsuleOpenedForToken(tokenId)).to.be.true;
    });

    it("컨트랙트 오너는 캡슐을 열 수 있어야 함", async function () {
      // 시간을 미래로 설정
      await ethers.provider.send("evm_setNextBlockTimestamp", [openTimestamp + 10]);
      await ethers.provider.send("evm_mine");

      // 컨트랙트 오너가 캡슐 열기
      await expect(
        timeCapsule.openCapsule(tokenId)
      ).to.emit(timeCapsule, "CapsuleOpened")
        .withArgs(tokenId, 1, owner.address, recipient1.address);

      expect(await timeCapsule.isCapsuleOpenedForToken(tokenId)).to.be.true;
    });

    it("여러 수신자가 있는 캡슐에서 각각 독립적으로 열 수 있어야 함", async function () {
      // 여러 수신자로 캡슐 생성
      const currentBlock = await ethers.provider.getBlock("latest");
      const multiOpenTimestamp = currentBlock.timestamp + 3600;
      
      await timeCapsule.createCapsule(
        [recipient1.address, recipient2.address],
        "Multi Capsule",
        "Test Description",
        multiOpenTimestamp,
        "ipfs://test-unopened-uri",
        "ipfs://test-opened-uri"
      );

      // 시간을 미래로 설정
      await ethers.provider.send("evm_setNextBlockTimestamp", [multiOpenTimestamp + 10]);
      await ethers.provider.send("evm_mine");

      // 첫 번째 토큰만 열기 (토큰 ID 2, 첫 번째는 beforeEach에서 생성됨)
      await timeCapsule.connect(recipient1).openCapsule(2);
      
      expect(await timeCapsule.isCapsuleOpenedForToken(2)).to.be.true;
      expect(await timeCapsule.isCapsuleOpenedForToken(3)).to.be.false;
      expect(await timeCapsule.tokenURI(2)).to.equal("ipfs://test-opened-uri");
      expect(await timeCapsule.tokenURI(3)).to.equal("ipfs://test-unopened-uri");

      // 두 번째 토큰도 열기
      await timeCapsule.connect(recipient2).openCapsule(3);
      
      expect(await timeCapsule.isCapsuleOpenedForToken(3)).to.be.true;
      expect(await timeCapsule.tokenURI(3)).to.equal("ipfs://test-opened-uri");
    });
  });

  describe("토큰 URI", function () {
    it("캡슐이 열린 후 올바른 토큰 URI를 반환해야 함", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const futureTimestamp = currentBlock.timestamp + 3600;
      const unopenedIpfsMetadataCid = "ipfs://test-unopened-uri";
      const openedIpfsMetadataCid = "ipfs://test-opened-uri";

      await timeCapsule.createCapsule(
        [recipient1.address],
        "Test Capsule",
        "Test Description",
        futureTimestamp,
        unopenedIpfsMetadataCid,
        openedIpfsMetadataCid
      );

      // 열리지 않은 상태의 토큰 URI 확인
      expect(await timeCapsule.tokenURI(1)).to.equal(unopenedIpfsMetadataCid);

      // 시간을 미래로 설정하고 캡슐 열기
      await ethers.provider.send("evm_setNextBlockTimestamp", [futureTimestamp + 10]);
      await ethers.provider.send("evm_mine");
      await timeCapsule.connect(recipient1).openCapsule(1);

      // 열린 상태의 토큰 URI 확인
      expect(await timeCapsule.tokenURI(1)).to.equal(openedIpfsMetadataCid);
    });

    it("존재하지 않는 토큰의 URI는 오류를 발생시켜야 함", async function () {
      await expect(
        timeCapsule.tokenURI(999)
      ).to.be.revertedWithCustomError(timeCapsule, "ERC721NonexistentToken");
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

    it("NFT 전송이 올바르게 작동해야 함", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const futureTimestamp = currentBlock.timestamp + 3600; // 1시간 후
      
      await timeCapsule.createCapsule(
        [recipient1.address],
        "Test Capsule",
        "Test Description",
        futureTimestamp,
        "ipfs://test-unopened-uri",
        "ipfs://test-opened-uri"
      );

      // NFT 소유자가 다른 주소로 전송
      await timeCapsule.connect(recipient1).transferFrom(recipient1.address, otherAccount.address, 1);

      expect(await timeCapsule.ownerOf(1)).to.equal(otherAccount.address);
      expect(await timeCapsule.balanceOf(recipient1.address)).to.equal(0);
      expect(await timeCapsule.balanceOf(otherAccount.address)).to.equal(1);
    });

    it("전송된 NFT도 캡슐을 열 수 있어야 함", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const futureTimestamp = currentBlock.timestamp + 3600;
      
      await timeCapsule.createCapsule(
        [recipient1.address],
        "Test Capsule",
        "Test Description",
        futureTimestamp,
        "ipfs://test-unopened-uri",
        "ipfs://test-opened-uri"
      );

      // NFT 전송
      await timeCapsule.connect(recipient1).transferFrom(recipient1.address, otherAccount.address, 1);

      // 시간을 미래로 설정
      await ethers.provider.send("evm_setNextBlockTimestamp", [futureTimestamp + 10]);
      await ethers.provider.send("evm_mine");

      // 새로운 소유자가 캡슐 열기
      await expect(
        timeCapsule.connect(otherAccount).openCapsule(1)
      ).to.emit(timeCapsule, "CapsuleOpened")
        .withArgs(1, 1, otherAccount.address, otherAccount.address);

      expect(await timeCapsule.isCapsuleOpenedForToken(1)).to.be.true;
    });
  });
}); 