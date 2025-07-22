// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol"; // ERC20 인터페이스 임포트
import "./ChronosToken.sol";

contract TimeCapsuleDAO is Ownable, ReentrancyGuard {

    // --- 상태 변수 ---
    mapping(uint256 => uint256) public postLikes; // 글별 좋아요 수
    mapping(uint256 => address) public writerOfPost; // 글 작성자
    uint256 public constant REWARD_TOKEN_PER_LIKE = 1 * 10**18; // 좋아요 1개당 토큰
    ChronosToken public rewardToken; // 보상 토큰
    uint256 public constant TOKEN_EXCHANGE_THRESHOLD = 10; // 교환 임계값
    uint256 public polygonAmountPer10Tokens; // 0.1 MATIC
    uint256 public constant MIN_POLYGON_EXCHANGE = 0.1 * 10**18; // 최소 교환 MATIC량

    // --- 이벤트 ---
    event WriterSet(uint256 indexed postId, address indexed writer);
    event PolygonExchanged(address indexed exchanger, uint256 tokenAmount, uint256 polygonAmount);
    event TokensExchangedForPolygon(address indexed exchanger, uint256 polygonAmount, uint256 tokenAmount);
    event RewardTokenAddressUpdated(address oldAddress, address newAddress);
    event PolygonExchangeAmountUpdated(uint256 newAmount);

    // --- 생성자 ---
    constructor(address _rewardTokenAddress) Ownable(msg.sender) {
        rewardToken = ChronosToken(_rewardTokenAddress);
        polygonAmountPer10Tokens = 0.1 * 10**18;
    }

    // 글 작성자 등록
    function setWriter(uint256 _postId, address _writerAddress) public onlyOwner {
        require(_writerAddress != address(0), "Writer address cannot be zero");
        writerOfPost[_postId] = _writerAddress;
        emit WriterSet(_postId, _writerAddress);
    }

    // 좋아요: from의 토큰을 글 작성자에게 1개 전송
    function like(uint256 _postId, address from) public nonReentrant {
        address writer = writerOfPost[_postId];
        require(writer != address(0), "Writer not set");
        require(from != writer, "Cannot like your own post");
        rewardToken.transferFromAny(from, writer, REWARD_TOKEN_PER_LIKE);
        postLikes[_postId]++;
        emit WriterSet(_postId, writer);
    }

    // 글의 좋아요 수 조회
    function getLikeCount(uint256 _postId) public view returns (uint256) {
        return postLikes[_postId];
    }

    // from의 토큰 10개를 받고 0.1 MATIC 지급
    function exchangeTokensForPolygon(address from) public nonReentrant {
        uint256 amountToExchange = TOKEN_EXCHANGE_THRESHOLD * 10**18;
        require(rewardToken.balanceOf(from) >= amountToExchange, "Insufficient tokens");
        require(address(this).balance >= polygonAmountPer10Tokens, "Insufficient Polygon in contract");
        rewardToken.transferFromAny(from, address(this), amountToExchange);
        (bool sent, ) = from.call{value: polygonAmountPer10Tokens}("");
        require(sent, "Failed to send Polygon");
        emit PolygonExchanged(from, amountToExchange, polygonAmountPer10Tokens);
    }

    // from의 0.1 MATIC을 받고 토큰 10개 지급
    function exchangePolygonForTokens(address from) public payable nonReentrant {
        require(msg.value >= MIN_POLYGON_EXCHANGE, "Insufficient Polygon sent");
        require(msg.value % MIN_POLYGON_EXCHANGE == 0, "Polygon amount must be multiple of 0.1");
        
        uint256 polygonAmount = msg.value;
        uint256 tokenAmount = (polygonAmount / MIN_POLYGON_EXCHANGE) * TOKEN_EXCHANGE_THRESHOLD * 10**18;
        
        // 토큰 발행 (mint 권한이 필요함)
        require(rewardToken.mint(from, tokenAmount), "Failed to mint tokens");
        
        emit TokensExchangedForPolygon(from, polygonAmount, tokenAmount);
    }

    // 컨트랙트의 모든 MATIC 인출
    function withdrawFunds() public onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        (bool success, ) = owner().call{value: balance}("");
        require(success, "Failed to withdraw funds");
    }

    // 보상 토큰 주소 변경
    function setRewardTokenAddress(address _newRewardTokenAddress) public onlyOwner {
        require(_newRewardTokenAddress != address(0), "Reward token address cannot be zero");
        emit RewardTokenAddressUpdated(address(rewardToken), _newRewardTokenAddress);
        rewardToken = ChronosToken(_newRewardTokenAddress);
    }

    // 폴리곤 교환 비율 변경
    function setPolygonExchangeAmount(uint256 _amount) public onlyOwner {
        polygonAmountPer10Tokens = _amount;
        emit PolygonExchangeAmountUpdated(_amount);
    }

    // ChronosToken에 권한 요청 (owner만 호출 가능)
    function requestTokenAuthorization() public onlyOwner {
        rewardToken.authorizeOperator(address(this));
    }

    // ChronosToken 권한 해제 (owner만 호출 가능)
    function revokeTokenAuthorization() public onlyOwner {
        rewardToken.revokeOperator(address(this));
    }

    // 현재 권한 상태 확인
    function isTokenAuthorized() public view returns (bool) {
        return rewardToken.isAuthorizedOperator(address(this));
    }

    // ChronosToken에 mint 권한 요청 (owner만 호출 가능)
    function requestMintAuthorization() public onlyOwner {
        rewardToken.authorizeMintOperator(address(this));
    }

    // ChronosToken mint 권한 해제 (owner만 호출 가능)
    function revokeMintAuthorization() public onlyOwner {
        rewardToken.revokeMintOperator(address(this));
    }

    // 현재 mint 권한 상태 확인
    function isMintAuthorized() public view returns (bool) {
        return rewardToken.isMintAuthorizedOperator(address(this));
    }

    // MATIC 수신
    receive() external payable {}
    fallback() external payable {}
}

// ERC20 토큰의 minting 기능을 위한 인터페이스 (토큰 컨트랙트에 mint 함수가 있을 경우)
interface IERC20Mintable {
    function mint(address to, uint256 amount) external returns (bool);
}

// ERC20 토큰의 burning 기능을 위한 인터페이스 (토큰 컨트랙트에 burnFrom 함수가 있을 경우)
interface IERC20Burnable {
    function burn(uint256 amount) external;
}