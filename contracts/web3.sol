// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TimeCapsule is ERC721, ERC721URIStorage, Ownable {
    uint256 private _tokenIdCounter;

    // 타임캡슐의 상세 정보를 담는 구조체 (여기서는 하나의 논리적 캡슐 정보)
    struct CapsuleContent { // Capsule을 CapsuleContent로 변경하여 명확히 함
        address creator;
        string title;
        string description;
        uint256 openTimestamp;
        string unopenedIpfsMetadataCid;
        string openedIpfsMetadataCid;
        bool isTransferable; // transfer 가능 여부
        bool isSmartContractTransferable; // smartcontract를 통한 transfer 가능 여부
        bool isSmartContractOpenable; // smartcontract를 통한 open 가능 여부
    }

    // 각 tokenId에 연결된 특정 캡슐의 상태 및 메타데이터 CID는 tokenURI를 통해 관리됨
    // 그리고 각 tokenId가 어떤 캡슐 콘텐츠를 참조하는지 매핑
    mapping(uint256 => uint256) public tokenIdToCapsuleContentId; // tokenId -> CapsuleContent ID
    mapping(uint256 => CapsuleContent) public capsuleContents; // CapsuleContent ID -> CapsuleContent
    mapping(uint256 => bool) public isCapsuleOpenedForToken; // 각 토큰 ID별 개봉 여부

    uint256 private _capsuleContentIdCounter; // 캡슐 콘텐츠 ID 관리를 위한 카운터

    // 캡슐 생성 시 발생하는 이벤트
    event CapsuleCreated(
        uint256 indexed firstTokenId, // 생성된 첫 번째 토큰 ID
        uint256 indexed capsuleContentId, // 캡슐 콘텐츠 ID
        address indexed creator,
        address[] recipients, // 여러 수신자 주소
        string title,
        uint256 openTimestamp,
        string unopenedIpfsMetadataCid
    );

    // 캡슐 개봉 시 발생하는 이벤트
    event CapsuleOpened(
        uint256 indexed tokenId,
        uint256 indexed capsuleContentId, // 개봉된 캡슐 콘텐츠 ID
        address indexed opener,
        address currentOwner
    );

    constructor(address initialOwner) ERC721("TimeCapsule", "TCAP") Ownable(initialOwner) {}

    /**
     * @dev 새로운 타임캡슐을 생성하고 "열릴 권리" NFT들을 발행합니다.
     * 지정된 _recipients 배열의 각 주소에게 고유한 tokenId를 가진 NFT가 민팅됩니다.
     * 이 NFT들은 하나의 논리적인 타임캡슐 콘텐츠를 공유합니다.
     *
     * @param _recipients 타임캡슐 NFT를 받을 주소들의 배열.
     * @param _title 타임캡슐의 제목.
     * @param _description 타임캡슐의 설명.
     * @param _openTimestamp 타임캡슐을 열 수 있는 Unix 타임스탬프.
     * @param _unopenedIpfsMetadataCid 열리지 않은 상태의 NFT 메타데이터 JSON 파일의 IPFS CID.
     * @param _openedIpfsMetadataCid 열린 상태의 NFT 메타데이터 JSON 파일의 IPFS CID.
     * @param _isTransferable transfer 가능 여부.
     * @param _isSmartContractTransferable smartcontract를 통한 transfer 가능 여부.
     * @param _isSmartContractOpenable smartcontract를 통한 open 가능 여부.
     * @return firstTokenId 생성된 첫 번째 타임캡슐의 고유 ID (tokenId).
     */
    function createCapsule(
        address[] memory _recipients, // 여러 수신자를 받기 위한 배열
        string memory _title,
        string memory _description,
        uint256 _openTimestamp,
        string memory _unopenedIpfsMetadataCid,
        string memory _openedIpfsMetadataCid,
        bool _isTransferable,
        bool _isSmartContractTransferable,
        bool _isSmartContractOpenable
    ) public onlyOwner returns (uint256) {
        require(bytes(_unopenedIpfsMetadataCid).length > 0, "TimeCapsule: Unopened metadata CID cannot be empty.");
        require(bytes(_openedIpfsMetadataCid).length > 0, "TimeCapsule: Opened metadata CID cannot be empty.");
        require(_recipients.length > 0, "TimeCapsule: Recipients array cannot be empty.");

        _capsuleContentIdCounter++;
        uint256 currentCapsuleContentId = _capsuleContentIdCounter;

        // 타임캡슐 콘텐츠 정보 저장 (모든 NFT가 공유할 정보)
        capsuleContents[currentCapsuleContentId] = CapsuleContent({
            creator: msg.sender,
            title: _title,
            description: _description,
            openTimestamp: _openTimestamp,
            unopenedIpfsMetadataCid: _unopenedIpfsMetadataCid,
            openedIpfsMetadataCid: _openedIpfsMetadataCid,
            isTransferable: _isTransferable,
            isSmartContractTransferable: _isSmartContractTransferable,
            isSmartContractOpenable: _isSmartContractOpenable
        });

        uint256 firstTokenId = 0; // 첫 번째 생성된 토큰 ID를 저장하기 위함

        // 각 수신자에게 NFT 민팅
        for (uint256 i = 0; i < _recipients.length; i++) {
            _tokenIdCounter++;
            uint256 newItemId = _tokenIdCounter;

            if (i == 0) {
                firstTokenId = newItemId; // 첫 번째 토큰 ID 기록
            }

            // 이 토큰 ID가 어떤 캡슐 콘텐츠를 참조하는지 매핑
            tokenIdToCapsuleContentId[newItemId] = currentCapsuleContentId;
            isCapsuleOpenedForToken[newItemId] = false; // 각 토큰은 처음엔 닫힌 상태

            // NFT를 수신자에게 민팅
            _safeMint(_recipients[i], newItemId);
            // 이 NFT의 메타데이터 URI를 "열리지 않은" 상태의 CID로 설정
            _setTokenURI(newItemId, _unopenedIpfsMetadataCid);
        }

        // CapsuleCreated 이벤트 발생
        emit CapsuleCreated(firstTokenId, currentCapsuleContentId, msg.sender, _recipients, _title, _openTimestamp, _unopenedIpfsMetadataCid);
        return firstTokenId;
    }

    /**
     * @dev 타임캡슐을 열고 NFT의 메타데이터를 "열린 콘텐츠"로 변경합니다.
     * 이 함수는 NFT의 현재 소유자 또는 해당 NFT에 대해 승인된 주소에 의해 호출될 수 있습니다.
     *
     * @param _tokenId 열고자 하는 타임캡슐 NFT의 ID.
     */
    function openCapsule(uint256 _tokenId) public {
        uint256 contentId = tokenIdToCapsuleContentId[_tokenId];
        CapsuleContent storage content = capsuleContents[contentId];

        // 해당 토큰이 이미 열렸는지 확인
        require(!isCapsuleOpenedForToken[_tokenId], "TimeCapsule: This token is already opened.");
        // 개봉 시점이 되었는지 확인
        require(block.timestamp >= content.openTimestamp, "TimeCapsule: It's not time yet.");

        // 호출자가 현재 _tokenId NFT의 소유자이거나 승인된 주소인지 확인
        address currentNFTOwner = ownerOf(_tokenId);
        bool isOwner = currentNFTOwner == msg.sender;
        bool isApproved = getApproved(_tokenId) == msg.sender;
        bool isContractOwner = owner() == msg.sender;
        
        // 컨트랙트 오너가 개봉하려는 경우, isSmartContractOpenable이 true여야 함
        if (isContractOwner && !content.isSmartContractOpenable) {
            revert("TimeCapsule: Contract owner cannot open this capsule.");
        }
        
        require(
            isOwner || isApproved || (isContractOwner && content.isSmartContractOpenable), 
            "TimeCapsule: Caller is not owner, approved, nor authorized contract owner."
        );

        // --- 핵심 로직: NFT 메타데이터 변경 ---
        // 1. 해당 토큰의 상태를 "열림"으로 업데이트
        isCapsuleOpenedForToken[_tokenId] = true;

        // 2. NFT의 메타데이터 URI를 "열린" 상태의 CID로 업데이트
        _setTokenURI(_tokenId, content.openedIpfsMetadataCid);

        // CapsuleOpened 이벤트 발생
        emit CapsuleOpened(_tokenId, contentId, msg.sender, currentNFTOwner);
    }

    // --- OpenZeppelin ERC721 표준 오버라이드 함수들 (동일) ---

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "";
    }

    /**
     * @dev 토큰 전송 전에 호출되는 함수로, transfer 제한을 확인합니다.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override(ERC721) returns (address) {
        address from = _ownerOf(tokenId);
        
        // from이 address(0)이 아닌 경우에만 transfer 제한 확인 (민팅 시에는 제한 없음)
        if (from != address(0)) {
            uint256 contentId = tokenIdToCapsuleContentId[tokenId];
            CapsuleContent storage content = capsuleContents[contentId];
            
            // transfer가 불가능한 경우
            if (!content.isTransferable) {
                revert("TimeCapsule: Transfer is not allowed for this capsule.");
            }
            
            // 스마트 컨트랙트를 통한 transfer가 불가능한 경우
            if (!content.isSmartContractTransferable && to.code.length > 0) {
                revert("TimeCapsule: Smart contract transfer is not allowed for this capsule.");
            }
        }
        
        return super._update(to, tokenId, auth);
    }
}