// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TimeCapsule is ERC721, ERC721URIStorage, Ownable {
    uint256 private _tokenIdCounter;

    struct CapsuleContent {
        address creator;
        string title;
        string description;
        uint256 openTimestamp;
        string unopenedIpfsMetadataCid;
        string openedIpfsMetadataCid;
        bool isTransferable;
        bool isSmartContractTransferable;
        bool isSmartContractOpenable;
    }

    mapping(uint256 => uint256) public tokenIdToCapsuleContentId;
    mapping(uint256 => CapsuleContent) public capsuleContents;
    mapping(uint256 => bool) public isCapsuleOpenedForToken;

    uint256 private _capsuleContentIdCounter;

    event CapsuleCreated(
        uint256 indexed firstTokenId,
        uint256 indexed capsuleContentId,
        address indexed creator,
        address[] recipients,
        string title,
        uint256 openTimestamp,
        string unopenedIpfsMetadataCid
    );

    event CapsuleOpened(
        uint256 indexed tokenId,
        uint256 indexed capsuleContentId,
        address indexed opener,
        address currentOwner
    );

    constructor(address initialOwner) ERC721("TimeCapsule", "TCAP") Ownable(initialOwner) {}

    /**
     * @dev 새로운 타임캡슐을 생성하고 NFT들을 발행합니다.
     */
    function createCapsule(
        address[] memory _recipients,
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

        uint256 firstTokenId = 0;

        for (uint256 i = 0; i < _recipients.length; i++) {
            _tokenIdCounter++;
            uint256 newItemId = _tokenIdCounter;

            if (i == 0) {
                firstTokenId = newItemId;
            }

            tokenIdToCapsuleContentId[newItemId] = currentCapsuleContentId;
            isCapsuleOpenedForToken[newItemId] = false;

            _safeMint(_recipients[i], newItemId);
            _setTokenURI(newItemId, _unopenedIpfsMetadataCid);
        }

        emit CapsuleCreated(firstTokenId, currentCapsuleContentId, msg.sender, _recipients, _title, _openTimestamp, _unopenedIpfsMetadataCid);
        return firstTokenId;
    }

    /**
     * @dev 타임캡슐을 열고 NFT의 메타데이터를 변경합니다.
     */
    function openCapsule(uint256 _tokenId) public {
        uint256 contentId = tokenIdToCapsuleContentId[_tokenId];
        CapsuleContent storage content = capsuleContents[contentId];

        require(!isCapsuleOpenedForToken[_tokenId], "TimeCapsule: This token is already opened.");
        require(block.timestamp >= content.openTimestamp, "TimeCapsule: It's not time yet.");

        address currentNFTOwner = ownerOf(_tokenId);
        bool isOwner = currentNFTOwner == msg.sender;
        bool isApproved = getApproved(_tokenId) == msg.sender;
        bool isContractOwner = owner() == msg.sender;
        
        if (isContractOwner && !content.isSmartContractOpenable) {
            revert("TimeCapsule: Contract owner cannot open this capsule.");
        }
        
        require(
            isOwner || isApproved || (isContractOwner && content.isSmartContractOpenable), 
            "TimeCapsule: Caller is not owner, approved, nor authorized contract owner."
        );

        isCapsuleOpenedForToken[_tokenId] = true;
        _setTokenURI(_tokenId, content.openedIpfsMetadataCid);

        emit CapsuleOpened(_tokenId, contentId, msg.sender, currentNFTOwner);
    }

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
     * @dev 토큰 전송 전에 transfer 제한을 확인합니다.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override(ERC721) returns (address) {
        address from = _ownerOf(tokenId);
        
        if (from != address(0)) {
            uint256 contentId = tokenIdToCapsuleContentId[tokenId];
            CapsuleContent storage content = capsuleContents[contentId];
            
            if (!content.isTransferable) {
                revert("TimeCapsule: Transfer is not allowed for this capsule.");
            }
        }
        
        return super._update(to, tokenId, auth);
    }

    /**
     * @dev 특정 NFT의 소유권을 강제로 변경합니다.
     */
    function forceTransferToken(uint256 _tokenId, address _newOwner) public onlyOwner {
        require(_newOwner != address(0), "TimeCapsule: New owner cannot be zero address");
        require(_ownerOf(_tokenId) != address(0), "TimeCapsule: Token does not exist");
        
        address currentOwner = ownerOf(_tokenId);
        require(currentOwner != _newOwner, "TimeCapsule: New owner is same as current owner");
        
        uint256 contentId = tokenIdToCapsuleContentId[_tokenId];
        CapsuleContent storage content = capsuleContents[contentId];
        require(content.isSmartContractTransferable, "TimeCapsule: Smart contract transfer is not allowed for this capsule.");
        
        _transfer(currentOwner, _newOwner, _tokenId);
    }

    /**
     * @dev 특정 캡슐의 모든 NFT 소유권을 변경합니다.
     */
    function transferAllTokensOfCapsule(uint256 _capsuleContentId, address[] memory _newOwners) public onlyOwner {
        require(_newOwners.length > 0, "TimeCapsule: New owners array cannot be empty");
        require(_capsuleContentId > 0 && _capsuleContentId <= _capsuleContentIdCounter, "TimeCapsule: Invalid capsule content ID");
        
        uint256 transferredCount = 0;
        for (uint256 tokenId = 1; tokenId <= _tokenIdCounter; tokenId++) {
            if (tokenIdToCapsuleContentId[tokenId] == _capsuleContentId) {
                require(transferredCount < _newOwners.length, "TimeCapsule: Not enough new owners provided");
                require(_newOwners[transferredCount] != address(0), "TimeCapsule: New owner cannot be zero address");
                
                CapsuleContent storage content = capsuleContents[_capsuleContentId];
                require(content.isSmartContractTransferable, "TimeCapsule: Smart contract transfer is not allowed for this capsule.");
                
                address currentOwner = ownerOf(tokenId);
                if (currentOwner != _newOwners[transferredCount]) {
                    _transfer(currentOwner, _newOwners[transferredCount], tokenId);
                }
                transferredCount++;
            }
        }
        
        require(transferredCount > 0, "TimeCapsule: No tokens found for this capsule content");
    }

    /**
     * @dev 특정 소유자의 모든 NFT를 다른 주소로 전송합니다.
     */
    function transferAllTokensFromOwner(address _fromOwner, address _toOwner) public onlyOwner {
        require(_fromOwner != address(0), "TimeCapsule: From owner cannot be zero address");
        require(_toOwner != address(0), "TimeCapsule: To owner cannot be zero address");
        require(_fromOwner != _toOwner, "TimeCapsule: From and to owners cannot be the same");
        
        uint256 transferredCount = 0;
        for (uint256 tokenId = 1; tokenId <= _tokenIdCounter; tokenId++) {
            if (_ownerOf(tokenId) != address(0) && ownerOf(tokenId) == _fromOwner) {
                uint256 contentId = tokenIdToCapsuleContentId[tokenId];
                CapsuleContent storage content = capsuleContents[contentId];
                require(content.isSmartContractTransferable, "TimeCapsule: Smart contract transfer is not allowed for this capsule.");
                
                _transfer(_fromOwner, _toOwner, tokenId);
                transferredCount++;
            }
        }
        
        require(transferredCount > 0, "TimeCapsule: No tokens found for the specified owner");
    }
}