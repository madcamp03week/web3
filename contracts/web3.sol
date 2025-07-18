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
        string description; // 설명 추가
        uint256 openTimestamp;
        string ipfsMetadataCid; // NFT 메타데이터 JSON의 IPFS CID
        bool isOpen;
        // string[] private ipfsCids; // 개별 콘텐츠 IPFS CID 배열 (필요시 주석 해제하여 사용)
    }

    mapping(uint256 => Capsule) public timeCapsules;

    event CapsuleCreated(
        uint256 indexed tokenId,
        address indexed recipient,
        string title,
        uint256 openTimestamp,
        string ipfsMetadataCid
    );

    event CapsuleOpened(
        uint256 indexed tokenId,
        address indexed recipient
    );

    constructor(address initialOwner) ERC721("TimeCapsule", "TCAP") Ownable(initialOwner) {}

    /**
     * @dev 새로운 타임캡슐을 생성하고 정보를 블록체인에 기록합니다.
     * @param _recipient 타임캡슐이 열렸을 때 NFT를 받을 지갑 주소.
     * @param _title 타임캡슐의 제목.
     * @param _description 타임캡슐의 설명 (선택 사항).
     * @param _openTimestamp 타임캡슐을 열 수 있는 Unix 타임스탬프.
     * @param _ipfsMetadataCid 타임캡슐 NFT 메타데이터 JSON 파일의 IPFS CID (e.g., "Qm...").
     * @return newItemId 생성된 타임캡슐의 고유 ID (tokenId).
     */
    function createCapsule(
        address _recipient,
        string memory _title,
        string memory _description, // 설명 인자 추가
        uint256 _openTimestamp,
        string memory _ipfsMetadataCid
    ) public onlyOwner returns (uint256) {
        require(_openTimestamp > block.timestamp, "TimeCapsule: Open timestamp must be in the future.");

        _tokenIdCounter++;
        uint256 newItemId = _tokenIdCounter;

        timeCapsules[newItemId] = Capsule({
            recipient: _recipient,
            title: _title,
            description: _description,
            openTimestamp: _openTimestamp,
            ipfsMetadataCid: _ipfsMetadataCid,
            isOpen: false
        });

        emit CapsuleCreated(newItemId, _recipient, _title, _openTimestamp, _ipfsMetadataCid);
        return newItemId;
    }

    /**
     * @dev 타임캡슐을 열고 NFT를 발행하여 수신자에게 전송합니다.
     * 이 함수는 openTimestamp가 도달했을 때 백엔드 스케줄링 서비스(또는 Chainlink Keeper)에 의해 호출될 것으로 예상됩니다.
     * @param _tokenId 열고자 하는 타임캡슐의 ID.
     */
    function openCapsule(uint256 _tokenId) public {
        Capsule storage capsule = timeCapsules[_tokenId];

        require(!capsule.isOpen, "TimeCapsule: Already opened.");
        require(block.timestamp >= capsule.openTimestamp, "TimeCapsule: It's not time yet.");
        require(bytes(capsule.ipfsMetadataCid).length > 0, "TimeCapsule: Metadata CID not set for this capsule.");


        // NFT 발행 (mint) 및 NFT 메타데이터 URI 설정
        // ERC721URIStorage의 tokenURI는 IPFS 게이트웨이 주소를 포함해야 합니다.
        // 예를 들어 "ipfs://QmW1_imageCID..." 형태여야 합니다.
        // createCapsule에서 받은 _ipfsMetadataCid가 이미 "ipfs://..." 형태라고 가정합니다.
        _setTokenURI(_tokenId, capsule.ipfsMetadataCid); // NFT 메타데이터 연결
        _safeMint(capsule.recipient, _tokenId); // NFT를 수신자에게 발행

        capsule.isOpen = true; // 캡슐 상태 업데이트

        emit CapsuleOpened(_tokenId, capsule.recipient);
    }

    // --- 문제 해결을 위해 추가하거나 수정한 부분 ---

    /**
     * @dev ERC721과 ERC721URIStorage 모두 tokenURI를 정의하므로, 명시적으로 오버라이드합니다.
     * ERC721URIStorage의 구현을 사용합니다.
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        // openCapsule 함수에서 _setTokenURI가 호출되어야 유효한 URI를 반환합니다.
        // 열리지 않은 캡슐에 대해 tokenURI를 호출하면 비어있는 문자열이 반환될 수 있습니다.
        return super.tokenURI(tokenId);
    }

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