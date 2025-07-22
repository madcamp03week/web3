const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TimeCapsuleDAO", function () {
  let ChronosToken;
  let chronosToken;
  let TimeCapsuleDAO;
  let timeCapsuleDAO;
  let owner;
  let user1;
  let user2;
  let user3;
  let otherAccount;

  beforeEach(async function () {
    // 계정들 가져오기
    [owner, user1, user2, user3, otherAccount] = await ethers.getSigners();

    // ChronosToken 배포
    ChronosToken = await ethers.getContractFactory("ChronosToken");
    chronosToken = await ChronosToken.deploy(owner.address);
    await chronosToken.waitForDeployment();

    // TimeCapsuleDAO 배포
    TimeCapsuleDAO = await ethers.getContractFactory("TimeCapsuleDAO");
    timeCapsuleDAO = await TimeCapsuleDAO.deploy(await chronosToken.getAddress());
    await timeCapsuleDAO.waitForDeployment();

    // TimeCapsuleDAO에 권한 부여
    await chronosToken.authorizeOperator(await timeCapsuleDAO.getAddress());

    // 테스트용 토큰 분배
    await chronosToken.transfer(user1.address, ethers.parseEther("100"));
    await chronosToken.transfer(user2.address, ethers.parseEther("100"));
    await chronosToken.transfer(user3.address, ethers.parseEther("100"));
  });

  describe("배포", function () {
    it("올바른 보상 토큰 주소로 배포되어야 함", async function () {
      expect(await timeCapsuleDAO.rewardToken()).to.equal(await chronosToken.getAddress());
    });

    it("올바른 폴리곤 교환 비율로 설정되어야 함", async function () {
      expect(await timeCapsuleDAO.polygonAmountPer10Tokens()).to.equal(ethers.parseEther("0.1"));
    });

    it("올바른 좋아요당 토큰 수량으로 설정되어야 함", async function () {
      expect(await timeCapsuleDAO.REWARD_TOKEN_PER_LIKE()).to.equal(ethers.parseEther("1"));
    });

    it("올바른 교환 임계값으로 설정되어야 함", async function () {
      expect(await timeCapsuleDAO.TOKEN_EXCHANGE_THRESHOLD()).to.equal(10);
    });
  });

  describe("글 작성자 등록", function () {
    it("owner만 글 작성자를 등록할 수 있어야 함", async function () {
      await expect(
        timeCapsuleDAO.connect(otherAccount).setWriter(1, user1.address)
      ).to.be.revertedWithCustomError(timeCapsuleDAO, "OwnableUnauthorizedAccount");
    });

    it("올바른 주소로 글 작성자를 등록할 수 있어야 함", async function () {
      await expect(
        timeCapsuleDAO.setWriter(1, user1.address)
      ).to.emit(timeCapsuleDAO, "WriterSet")
        .withArgs(1, user1.address);

      expect(await timeCapsuleDAO.writerOfPost(1)).to.equal(user1.address);
    });

    it("zero address로 글 작성자를 등록할 수 없어야 함", async function () {
      await expect(
        timeCapsuleDAO.setWriter(1, ethers.ZeroAddress)
      ).to.be.revertedWith("Writer address cannot be zero");
    });

    it("여러 글에 대해 다른 작성자를 등록할 수 있어야 함", async function () {
      await timeCapsuleDAO.setWriter(1, user1.address);
      await timeCapsuleDAO.setWriter(2, user2.address);

      expect(await timeCapsuleDAO.writerOfPost(1)).to.equal(user1.address);
      expect(await timeCapsuleDAO.writerOfPost(2)).to.equal(user2.address);
    });
  });

  describe("좋아요 기능", function () {
    beforeEach(async function () {
      // 글 작성자 등록
      await timeCapsuleDAO.setWriter(1, user1.address);
    });

    it("등록된 글에 좋아요를 할 수 있어야 함", async function () {
      const initialBalance = await chronosToken.balanceOf(user1.address);
      
      await expect(
        timeCapsuleDAO.like(1, user2.address)
      ).to.emit(timeCapsuleDAO, "WriterSet")
        .withArgs(1, user1.address);

      expect(await timeCapsuleDAO.getLikeCount(1)).to.equal(1);
      expect(await chronosToken.balanceOf(user1.address)).to.equal(initialBalance + ethers.parseEther("1"));
    });

    it("등록되지 않은 글에 좋아요를 할 수 없어야 함", async function () {
      await expect(
        timeCapsuleDAO.like(999, user2.address)
      ).to.be.revertedWith("Writer not set");
    });

    it("자신의 글에 좋아요를 할 수 없어야 함", async function () {
      await expect(
        timeCapsuleDAO.like(1, user1.address)
      ).to.be.revertedWith("Cannot like your own post");
    });

    it("여러 사용자가 같은 글에 좋아요를 할 수 있어야 함", async function () {
      await timeCapsuleDAO.like(1, user2.address);
      await timeCapsuleDAO.like(1, user3.address);

      expect(await timeCapsuleDAO.getLikeCount(1)).to.equal(2);
    });

    it("좋아요 수가 올바르게 증가해야 함", async function () {
      expect(await timeCapsuleDAO.getLikeCount(1)).to.equal(0);
      
      await timeCapsuleDAO.like(1, user2.address);
      expect(await timeCapsuleDAO.getLikeCount(1)).to.equal(1);
      
      await timeCapsuleDAO.like(1, user3.address);
      expect(await timeCapsuleDAO.getLikeCount(1)).to.equal(2);
    });

    it("좋아요 시 토큰이 올바르게 전송되어야 함", async function () {
      const initialUser1Balance = await chronosToken.balanceOf(user1.address);
      const initialUser2Balance = await chronosToken.balanceOf(user2.address);

      await timeCapsuleDAO.like(1, user2.address);

      expect(await chronosToken.balanceOf(user1.address)).to.equal(initialUser1Balance + ethers.parseEther("1"));
      expect(await chronosToken.balanceOf(user2.address)).to.equal(initialUser2Balance - ethers.parseEther("1"));
    });
  });

  describe("토큰 교환 기능", function () {
    beforeEach(async function () {
      // 컨트랙트에 MATIC 보내기
      await owner.sendTransaction({
        to: await timeCapsuleDAO.getAddress(),
        value: ethers.parseEther("10")
      });
    });

    it("충분한 토큰이 있을 때 교환이 성공해야 함", async function () {
      const initialTokenBalance = await chronosToken.balanceOf(user1.address);
      const initialPolygonBalance = await ethers.provider.getBalance(user1.address);

      await expect(
        timeCapsuleDAO.exchangeTokensForPolygon(user1.address)
      ).to.emit(timeCapsuleDAO, "PolygonExchanged")
        .withArgs(user1.address, ethers.parseEther("10"), ethers.parseEther("0.1"));

      expect(await chronosToken.balanceOf(user1.address)).to.equal(initialTokenBalance - ethers.parseEther("10"));
      expect(await ethers.provider.getBalance(user1.address)).to.equal(initialPolygonBalance + ethers.parseEther("0.1"));
    });

    it("충분한 토큰이 없으면 교환이 실패해야 함", async function () {
      // 토큰을 모두 사용
      await chronosToken.transferFromAny(user1.address, owner.address, await chronosToken.balanceOf(user1.address));

      await expect(
        timeCapsuleDAO.exchangeTokensForPolygon(user1.address)
      ).to.be.revertedWith("Insufficient tokens");
    });

    it("컨트랙트에 충분한 MATIC이 없으면 교환이 실패해야 함", async function () {
      // 모든 MATIC 인출
      await timeCapsuleDAO.withdrawFunds();

      await expect(
        timeCapsuleDAO.exchangeTokensForPolygon(user1.address)
      ).to.be.revertedWith("Insufficient Polygon in contract");
    });

    it("교환 후 토큰이 올바르게 차감되어야 함", async function () {
      const initialBalance = await chronosToken.balanceOf(user1.address);
      
      await timeCapsuleDAO.exchangeTokensForPolygon(user1.address);
      
      expect(await chronosToken.balanceOf(user1.address)).to.equal(initialBalance - ethers.parseEther("10"));
    });

    it("교환 후 MATIC이 올바르게 지급되어야 함", async function () {
      const initialBalance = await ethers.provider.getBalance(user1.address);
      
      await timeCapsuleDAO.exchangeTokensForPolygon(user1.address);
      
      expect(await ethers.provider.getBalance(user1.address)).to.equal(initialBalance + ethers.parseEther("0.1"));
    });
  });

  describe("자금 인출", function () {
    beforeEach(async function () {
      // 컨트랙트에 MATIC 보내기
      await owner.sendTransaction({
        to: await timeCapsuleDAO.getAddress(),
        value: ethers.parseEther("5")
      });
    });

    it("owner만 자금을 인출할 수 있어야 함", async function () {
      await expect(
        timeCapsuleDAO.connect(otherAccount).withdrawFunds()
      ).to.be.revertedWithCustomError(timeCapsuleDAO, "OwnableUnauthorizedAccount");
    });

    it("owner가 모든 자금을 인출할 수 있어야 함", async function () {
      const initialOwnerBalance = await ethers.provider.getBalance(owner.address);
      
      await timeCapsuleDAO.withdrawFunds();
      
      expect(await ethers.provider.getBalance(await timeCapsuleDAO.getAddress())).to.equal(0);
      expect(await ethers.provider.getBalance(owner.address)).to.be.gt(initialOwnerBalance);
    });

    it("자금이 없으면 인출이 실패해야 함", async function () {
      await timeCapsuleDAO.withdrawFunds();
      
      await expect(
        timeCapsuleDAO.withdrawFunds()
      ).to.be.revertedWith("No funds to withdraw");
    });
  });

  describe("설정 변경", function () {
    it("owner만 보상 토큰 주소를 변경할 수 있어야 함", async function () {
      await expect(
        timeCapsuleDAO.connect(otherAccount).setRewardTokenAddress(otherAccount.address)
      ).to.be.revertedWithCustomError(timeCapsuleDAO, "OwnableUnauthorizedAccount");
    });

    it("올바른 주소로 보상 토큰 주소를 변경할 수 있어야 함", async function () {
      await expect(
        timeCapsuleDAO.setRewardTokenAddress(otherAccount.address)
      ).to.emit(timeCapsuleDAO, "RewardTokenAddressUpdated")
        .withArgs(await chronosToken.getAddress(), otherAccount.address);

      expect(await timeCapsuleDAO.rewardToken()).to.equal(otherAccount.address);
    });

    it("zero address로 보상 토큰 주소를 변경할 수 없어야 함", async function () {
      await expect(
        timeCapsuleDAO.setRewardTokenAddress(ethers.ZeroAddress)
      ).to.be.revertedWith("Reward token address cannot be zero");
    });

    it("owner만 폴리곤 교환 비율을 변경할 수 있어야 함", async function () {
      await expect(
        timeCapsuleDAO.connect(otherAccount).setPolygonExchangeAmount(ethers.parseEther("0.2"))
      ).to.be.revertedWithCustomError(timeCapsuleDAO, "OwnableUnauthorizedAccount");
    });

    it("올바른 비율로 폴리곤 교환 비율을 변경할 수 있어야 함", async function () {
      await expect(
        timeCapsuleDAO.setPolygonExchangeAmount(ethers.parseEther("0.2"))
      ).to.emit(timeCapsuleDAO, "PolygonExchangeAmountUpdated")
        .withArgs(ethers.parseEther("0.2"));

      expect(await timeCapsuleDAO.polygonAmountPer10Tokens()).to.equal(ethers.parseEther("0.2"));
    });
  });

  describe("권한 관리", function () {
    it("권한 요청이 성공해야 함", async function () {
      // 새로운 TimeCapsuleDAO 인스턴스 생성 (권한이 없는 상태)
      const newTimeCapsuleDAO = await TimeCapsuleDAO.deploy(await chronosToken.getAddress());
      await newTimeCapsuleDAO.waitForDeployment();
      
      // 직접 ChronosToken에서 권한 부여
      await chronosToken.authorizeOperator(await newTimeCapsuleDAO.getAddress());
      
      expect(await newTimeCapsuleDAO.isTokenAuthorized()).to.be.true;
    });

    it("권한 해제가 성공해야 함", async function () {
      // 직접 ChronosToken에서 권한 해제
      await chronosToken.revokeOperator(await timeCapsuleDAO.getAddress());
      
      expect(await timeCapsuleDAO.isTokenAuthorized()).to.be.false;
    });

    it("권한 상태를 올바르게 확인할 수 있어야 함", async function () {
      expect(await timeCapsuleDAO.isTokenAuthorized()).to.be.true; // beforeEach에서 이미 권한 부여됨
      
      // 직접 ChronosToken에서 권한 해제
      await chronosToken.revokeOperator(await timeCapsuleDAO.getAddress());
      expect(await timeCapsuleDAO.isTokenAuthorized()).to.be.false;
    });
  });

  describe("MATIC 수신", function () {
    it("컨트랙트가 MATIC을 받을 수 있어야 함", async function () {
      const initialBalance = await ethers.provider.getBalance(await timeCapsuleDAO.getAddress());
      
      await owner.sendTransaction({
        to: await timeCapsuleDAO.getAddress(),
        value: ethers.parseEther("1")
      });
      
      expect(await ethers.provider.getBalance(await timeCapsuleDAO.getAddress())).to.equal(initialBalance + ethers.parseEther("1"));
    });

    it("fallback 함수로 MATIC을 받을 수 있어야 함", async function () {
      const initialBalance = await ethers.provider.getBalance(await timeCapsuleDAO.getAddress());
      
      await owner.sendTransaction({
        to: await timeCapsuleDAO.getAddress(),
        value: ethers.parseEther("1"),
        data: "0x12345678" // 임의의 데이터
      });
      
      expect(await ethers.provider.getBalance(await timeCapsuleDAO.getAddress())).to.equal(initialBalance + ethers.parseEther("1"));
    });
  });

  describe("통합 테스트", function () {
    it("전체 워크플로우가 올바르게 작동해야 함", async function () {
      // 1. 글 작성자 등록
      await timeCapsuleDAO.setWriter(1, user1.address);
      
      // 2. 좋아요
      await timeCapsuleDAO.like(1, user2.address);
      await timeCapsuleDAO.like(1, user3.address);
      
      expect(await timeCapsuleDAO.getLikeCount(1)).to.equal(2);
      expect(await chronosToken.balanceOf(user1.address)).to.equal(ethers.parseEther("102")); // 100 + 2
      
      // 3. 컨트랙트에 MATIC 보내기
      await owner.sendTransaction({
        to: await timeCapsuleDAO.getAddress(),
        value: ethers.parseEther("1")
      });
      
      // 4. 토큰 교환
      await timeCapsuleDAO.exchangeTokensForPolygon(user2.address);
      
      expect(await chronosToken.balanceOf(user2.address)).to.equal(ethers.parseEther("89")); // 100 - 10 - 1 (좋아요로 인한 차감)
      expect(await ethers.provider.getBalance(user2.address)).to.be.gt(ethers.parseEther("10000")); // MATIC 증가 확인
    });

    it("권한이 없는 상태에서 기능이 실패해야 함", async function () {
      // 새로운 TimeCapsuleDAO 인스턴스 생성 (권한이 없는 상태)
      const newTimeCapsuleDAO = await TimeCapsuleDAO.deploy(await chronosToken.getAddress());
      await newTimeCapsuleDAO.waitForDeployment();
      
      // 글 작성자 등록
      await newTimeCapsuleDAO.setWriter(1, user1.address);
      
      // 좋아요 시도 (실패해야 함)
      await expect(
        newTimeCapsuleDAO.like(1, user2.address)
      ).to.be.revertedWith("Not authorized");
    });
  });
}); 