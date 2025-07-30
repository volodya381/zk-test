// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Інтерфейс верифікатора Semaphore (перевіряє ZK‑докази: true/false)
import "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";
// Міксин з OpenZeppelin: додає власника контракту (owner) і модифікатор onlyOwner
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ComplaintsV2 is Ownable {
    // Адреса контракта-верифікатора Semaphore, фіксується в конструкторі
    ISemaphoreVerifier public immutable verifier;

    // Які Merkle‑root (версії whitelist'у) дозволені до прийому скарг
    // allowedRoots[root] == true => можна використовувати цей root
    mapping(uint256 => bool) public allowedRoots;

    // Анти‑повтор: записуємо використані nullifierHash
    // Якщо nullifier уже був — другу скаргу з тим самим (seed, topic) відхиляємо
    mapping(uint256 => bool) public usedNullifiers;

    // Подія, яку видно в експлорері після успішного submit
    //  - root         — корінь меркл‑дерева групи (який whitelist)
    //  - nullifierHash— унікальний одноразовий "номер" для (identity, topic)
    //  - topicId      — хеш назви topic (externalNullifier)
    //  - messageHash  — bytes32-хеш поля повідомлення (сам текст не зберігається)
    event ComplaintSubmitted(
        uint256 indexed root,
        uint256 indexed nullifierHash,
        uint256 indexed topicId,   
        bytes32 messageHash        
    );

    // Конструктор: зберігаємо адресу верифікатора та призначаємо owner'а (деплойера)
    constructor(address _verifier) Ownable(msg.sender) {
        verifier = ISemaphoreVerifier(_verifier);
    }

    // Адмінська функція: дозволити/заборонити конкретний Merkle‑root
    // Викликає лише власник контракту
    function setRoot(uint256 root, bool allowed) external onlyOwner {
        allowedRoots[root] = allowed;
    }

    // Головна функція прийому скарги через ZK‑доказ
    // pA, pB, pC        — частини Groth16‑доказу
    // pubSignals        — 4 публічні сигнали з доказу у такому порядку:
    //                     [0] = root (Merkle‑root групи)
    //                     [1] = nullifierHash (анти‑повтор для (identity, topic))
    //                     [2] = messageField (використовуємо як джерело для messageHash)
    //                     [3] = topicId / externalNullifier (хеш назви topic)
    // treeDepth         — глибина дерева, з якою згенеровано доказ
    function submit(
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[4] calldata pubSignals,
        uint treeDepth
    ) external {
        // 1) Перевіряємо, що root з доказу дозволений адміном
        require(allowedRoots[pubSignals[0]], "Root not allowed");

        // 2) Перевіряємо сам ZK‑доказ через верифікатор Semaphore
        bool ok = verifier.verifyProof(pA, pB, pC, pubSignals, treeDepth);
        require(ok, "Invalid proof");

        // 3) Блокуємо повтор: один і той самий nullifierHash можна використати лише раз
        uint256 nullifierHash = pubSignals[1];
        require(!usedNullifiers[nullifierHash], "Already used");
        usedNullifiers[nullifierHash] = true;

        // 4) Емітимо подію — публічний слід у ланцюзі.
        //    Текст повідомлення не пишемо; лише bytes32‑хеш messageField.
        emit ComplaintSubmitted(
            pubSignals[0],           // root
            nullifierHash,           // nullifierHash
            pubSignals[3],           // topicId (externalNullifier)
            bytes32(pubSignals[2])   // messageHash (bytes32)
        );
    }
}
