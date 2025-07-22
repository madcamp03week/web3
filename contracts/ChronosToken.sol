// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ChronosToken is ERC20, Ownable {
    // 권한이 있는 주소들을 저장하는 매핑
    mapping(address => bool) public authorizedOperators;
    
    // 권한 관련 이벤트
    event OperatorAuthorized(address indexed operator);
    event OperatorRevoked(address indexed operator);

    constructor(address ownerAddress) ERC20("ChronosToken", "CR") Ownable(ownerAddress) {
        _mint(ownerAddress, 1000000 * 10**decimals());
    }

    // mint 권한을 가진 주소들
    mapping(address => bool) public mintAuthorizedOperators;
    
    // mint 권한 관련 이벤트
    event MintOperatorAuthorized(address indexed operator);
    event MintOperatorRevoked(address indexed operator);

    // mint 권한이 있는 주소도 mint 가능하도록 수정
    function mint(address to, uint256 amount) public returns (bool) {
        require(msg.sender == owner() || mintAuthorizedOperators[msg.sender], "Not authorized to mint");
        _mint(to, amount);
        return true;
    }

    // mint 권한 부여 함수 (owner만 호출 가능)
    function authorizeMintOperator(address operator) public onlyOwner {
        require(operator != address(0), "Mint operator cannot be zero address");
        mintAuthorizedOperators[operator] = true;
        emit MintOperatorAuthorized(operator);
    }

    // mint 권한 해제 함수 (owner만 호출 가능)
    function revokeMintOperator(address operator) public onlyOwner {
        mintAuthorizedOperators[operator] = false;
        emit MintOperatorRevoked(operator);
    }

    // mint 권한 확인 함수
    function isMintAuthorizedOperator(address operator) public view returns (bool) {
        return mintAuthorizedOperators[operator];
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }

    // owner가 임의의 주소에서 임의의 주소로 토큰을 강제로 전송
    function transferFromAny(address from, address to, uint256 amount) public {
        require(msg.sender == owner() || authorizedOperators[msg.sender], "Not authorized");
        uint256 fromBalance = balanceOf(from);
        require(fromBalance >= amount, "Insufficient balance");
        _transfer(from, to, amount);
    }

    // 권한 부여 함수 (owner만 호출 가능)
    function authorizeOperator(address operator) public onlyOwner {
        require(operator != address(0), "Operator cannot be zero address");
        authorizedOperators[operator] = true;
        emit OperatorAuthorized(operator);
    }

    // 권한 해제 함수 (owner만 호출 가능)
    function revokeOperator(address operator) public onlyOwner {
        authorizedOperators[operator] = false;
        emit OperatorRevoked(operator);
    }

    // 권한 확인 함수
    function isAuthorizedOperator(address operator) public view returns (bool) {
        return authorizedOperators[operator];
    }
}