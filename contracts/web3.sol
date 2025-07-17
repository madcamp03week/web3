// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TimeCapsule is ERC721, ERC721URIStorage, Ownable {
    uint256 private _tokenIdCounter;

    struct Capsule {
        address recipient;
        string title;
        uint256 openTimestamp;
        bool isOpen;
    }

    mapping(uint256 => Capsule) public timeCapsules;

    event CapsuleCreated(
        uint256 indexed tokenId,
        address indexed recipient,
        string title,
        uint256 openTimestamp
    );

    event CapsuleOpened(
        uint256 indexed tokenId,
        address indexed recipient
    );

    constructor(address initialOwner) ERC721("TimeCapsule", "TCAP") Ownable(initialOwner) {}

    function createCapsule(
        address _recipient,
        string memory _title,
        uint256 _openTimestamp,
        string memory _tokenURI
    ) public onlyOwner returns (uint256) {
        _tokenIdCounter++;
        uint256 newItemId = _tokenIdCounter;

        _setTokenURI(newItemId, _tokenURI);

        timeCapsules[newItemId] = Capsule({
            recipient: _recipient,
            title: _title,
            openTimestamp: _openTimestamp,
            isOpen: false
        });

        emit CapsuleCreated(newItemId, _recipient, _title, _openTimestamp);
        return newItemId;
    }

    function openCapsule(uint256 _tokenId) public {
        Capsule storage capsule = timeCapsules[_tokenId];

        require(!capsule.isOpen, "TimeCapsule: Already opened.");
        require(block.timestamp >= capsule.openTimestamp, "TimeCapsule: It's not time yet.");

        capsule.isOpen = true;

        _safeMint(capsule.recipient, _tokenId);

        emit CapsuleOpened(_tokenId, capsule.recipient);
    }

    function setTokenURI(uint256 tokenId, string memory _tokenURI) public onlyOwner {
        _setTokenURI(tokenId, _tokenURI);
    }

    // --- 문제 해결을 위해 추가하거나 수정한 부분 ---

    /**
     * @dev ERC721과 ERC721URIStorage 모두 tokenURI를 정의하므로, 명시적으로 오버라이드합니다.
     * ERC721URIStorage의 구현을 사용합니다.
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage) // 두 부모 클래스 명시
        returns (string memory)
    {
        return super.tokenURI(tokenId); // ERC721URIStorage의 tokenURI를 호출
    }

    // --- 기존 supportsInterface 함수는 그대로 유지 ---

    /**
     * @dev ERC721URIStorage의 필수 오버라이드 함수입니다.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev 컨트랙트의 _baseURI 기능을 비활성화하기 위해 오버라이드합니다.
     * 우리는 ERC721URIStorage의 tokenURI를 직접 사용합니다.
     */
    function _baseURI() internal pure override returns (string memory) {
        return "";
    }
}