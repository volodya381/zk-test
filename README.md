🛡️ zk‑complaints (Semaphore)

Анонімні скарги для whitelist DAO: користувач із переліку може залишити рівно одну скаргу на одну тему (topic). Анонімність гарантується ZK‑доказом (Semaphore). Контракт зберігає тільки хеші; прив’язки до адреси немає.

🧰 Стек

    ZK: @semaphore-protocol/* (генерація/верифікація пруфів)
    Контракти: Solidity + Hardhat
    Інфраструктура: snarkjs, Hardhat
    Фронт: React + Vite + TypeScript (Tailwind)
    Мережа: Ethereum Sepolia

📁 Структура

```
    zk-complaints/
    ├─ test-project/                # контракти + hardhat-скрипти
    │  ├─ contracts/                # ComplaintsV2.sol (+ імпорт SemaphoreVerifier)
    │  ├─ scripts/                  # утиліти (деплой, whitelist, діагностика і т.д.)
    │  ├─ deployments/              # адреси задеплоєних контрактів (JSON)
    │  │  └─ sepolia.v2.json
    │  └─ examples/                 # локальні артефакти (whitelist/група/пруф)
    │     ├─ members.csv
    │     ├─ group.json
    │     └─ identity.json
    ├─ web/                         # фронтенд (Vite + React)
    │  ├─ public/
    │  │  └─ group.json             # копія групи для фронта (оновлюється вручну з test-project/examples/group.json)
    │  ├─ src/
    │  │  └─ App.tsx                # UI + генерація proof та відправка у контракт
    │  └─ .env                      # VITE_CONTRACT, VITE_CHAIN_ID, VITE_DEFAULT_TOPIC
    ├─ nx.json
    ├─ package.json
    └─ README.md
```

🚀 TL;DR (з нуля до працюючого фронта)

    Передумови
    Node 18/20+, гаманець із трохи ETH у Sepolia, RPC‑URL (Alchemy/Infura/QuickNode).


0) Підготувати бек

```
    cd test-project

    npm install

```

Створи test-project/.env:

SEPOLIA_RPC_URL=<твій RPC URL>
PRIVATE_KEY=<приватний ключ для деплою>

1) Деплой у Sepolia

# 1.1 Верефікатор Semaphore (локальний інстанс)
npx hardhat run scripts/deploy-verifier.ts --network sepolia

# 1.2 Основний контракт ComplaintsV2
npx hardhat run scripts/deploy-v2.ts --network sepolia

    📄 Адреси збережуться в test-project/deployments/sepolia.v2.json.

2) Whitelist → Merkle‑група

# додай учасників (seed → commitment)
npx ts-node scripts/add-member.ts seed-1
npx ts-node scripts/add-member.ts seed-2
npx ts-node scripts/add-member.ts seed-3

# побудуй групу і отримай root
npx ts-node scripts/gen-group.ts

    📄 З’явиться/оновиться test-project/examples/group.json.

3) Дозволити root у контракті

npx hardhat run scripts/allow-root.ts --network sepolia

4) Фронт

cd ../web
npm install

Створи web/.env:

VITE_CONTRACT=<АДРЕСА ComplaintsV2 з test-project/deployments/sepolia.v2.json>
VITE_CHAIN_ID=11155111
VITE_DEFAULT_TOPIC=complaints-v1

Скопіюй актуальний group.json:

copy ..\test-project\examples\group.json .\public\group.json (або просто руками перенеси і все)

Запусти фронт:

npm run dev

Відкрий http://localhost:5173 → підключи гаманець → Seed: seed-1 → Topic: backend-complaints → Message → Generate proof & Submit.
🧪 Додаткові корисні скрипти

    Усі запускаються з папки test-project/.

✅ Офчейн‑перевірка пруфа

npx ts-node scripts/verify-offchain.ts

Виведе Off-chain verify: true/false для examples/proof.json.
🧭 Діагностика дозволених root’ів

npx hardhat run scripts/diagnose-root.ts --network sepolia

Покаже адресу контракту, root із group.json і proof.json, та allowedRoots[...].
🧪 Згенерувати proof (без фронта)

npx ts-node scripts/gen-proof.ts

Створить/перезапише examples/proof.json (використовує examples/identity.json і examples/group.json).
📤 Надіслати proof у контракт із файлу

npx hardhat run scripts/submit-proof.ts --network sepolia

Спочатку робить staticCall (dry‑run), далі — реальна транза.
🔁 Типовий цикл оновлення whitelist

    Додай/зміни учасників:
    npx ts-node scripts/add-member.ts seed-N

    Перебудуй групу:
    npx ts-node scripts/gen-group.ts

    Дозволь новий root у контракті:
    npx hardhat run scripts/allow-root.ts --network sepolia

    Скопіюй новий group.json у фронт:
    copy ..\test-project\examples\group.json .\web\public\group.json

❗️Troubleshooting

Root not allowed (фронт або submit-proof)
— Після зміни групи не запустили allow-root.ts або фронт читає старий web/public/group.json.
Фікс: gen-group.ts → allow-root.ts → скопіювати group.json у фронт → перезібрати фронт.

Invalid proof
— Невідповідність групи/рута між фронтом і контрактом, неправильний порядок сигналів, або повторне використання даних.
Фікс: переконайтеся, що web/public/group.json відповідає дозволеному root в контракті; спробуйте інший Topic або Seed.

Already used
— Для цієї пари (seed, topic) nullifier уже використаний.
Фікс: змініть Topic (наприклад, додайте суфікс часу) або використайте інший Seed (іншого члена групи).

Invalid CONTRACT env value на фронті
— Неправильна адреса в web/.env → VITE_CONTRACT.
Фікс: встав точну адресу з test-project/deployments/sepolia.v2.json, без коментарів/зайвих пробілів.

🔒 Безпека

    Не коміть test-project/.env і приватні ключі.

    Для справжньої анонімності в проді використовуйте релєєр (gas платитиме бек або донор‑адреса, а не користувач).

🗂️ Де що лежить

    test-project/contracts/ComplaintsV2.sol — контракт (верифікація пруфа, захист від повторів, подія).

    test-project/scripts/*.ts — сервісні скрипти (деплой, whitelist, діагностика, тестові сабміти).

    test-project/examples/ — локальні артефакти: members.csv, group.json, identity.json, proof.json.

    test-project/deployments/sepolia.v2.json — адреси задеплоєних контрактів.

    web/ — фронтанд; конфіг у web/.env, група для фронта — web/public/group.json.
