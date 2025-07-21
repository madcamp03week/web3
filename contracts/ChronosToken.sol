// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ChronosToken is ERC20, Ownable {
    constructor(address ownerAddress) ERC20("ChronosToken", "CR") Ownable(ownerAddress) {
        _mint(ownerAddress, 1000000 * 10**decimals());
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }

    // owner가 임의의 주소에서 임의의 주소로 토큰을 강제로 전송
    function transferFromAny(address from, address to, uint256 amount) public onlyOwner {
        uint256 fromBalance = balanceOf(from);
        require(fromBalance >= amount, "Insufficient balance");
        _transfer(from, to, amount);
    }
}