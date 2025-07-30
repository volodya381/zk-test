# 🛡️ `zk-complaints (Semaphore)`

**Анонімні скарги** для whitelist DAO: користувач із переліку може залишити **рівно одну скаргу на одну тему** (`topic`).
Анонімність гарантується ZK‑доказом (Semaphore). Контракт зберігає **тільки хеші**, без прив’язки до адрес.

---

## 🧰 Стек

| Компонент          | Опис                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **ZK**             | [`@semaphore-protocol/*`](https://semaphore.appliedzkp.org/) – генерація/верифікація пруфів |
| **Контракти**      | Solidity + Hardhat                                                                          |
| **Інфраструктура** | snarkjs, hardhat-scripts                                                                    |
| **Фронт**          | React + Vite + TypeScript (TailwindCSS)                                                     |
| **Мережа**         | Ethereum Sepolia                                                                            |

---

## 📁 Структура проєкту

```
zk-complaints/
├─ test-project/                  # контракти + hardhat-скрипти
│  ├─ contracts/                  # ComplaintsV2.sol (+ SemaphoreVerifier)
│  ├─ scripts/                    # утиліти (деплой, whitelist, діагностика)
│  ├─ deployments/                # збережені адреси контрактів
│  │  └─ sepolia.v2.json
│  └─ examples/                   # локальні артефакти (група, члени, ідентичності)
│     ├─ members.csv
│     ├─ group.json
│     └─ identity.json
├─ web/                           # фронт (Vite + React)
│  ├─ public/
│  │  └─ group.json               # копія групи для фронта
│  ├─ src/
│  │  └─ App.tsx                  # UI + генерація та сабміт пруфа
│  └─ .env                        # VITE_CONTRACT, VITE_CHAIN_ID, VITE_DEFAULT_TOPIC
├─ nx.json
├─ package.json
└─ README.md
```

---

## 🚀 TL;DR – від 0 до фронта

### 📦 Передумови

* Node.js 18+ або 20+
* Гаманець з трохи ETH у Sepolia
* RPC-URL (Alchemy, Infura або QuickNode)

---

### 🔧 0. Підготувати бекенд

```bash
cd test-project
npm install
```

**Створи `.env` файл у `test-project/`:**

```
SEPOLIA_RPC_URL=<твій RPC URL>
PRIVATE_KEY=<твій приватний ключ>
```

---

### ⛓ 1. Деплой у Sepolia

#### 1.1 Верифікатор Semaphore

```bash
npx hardhat run scripts/deploy-verifier.ts --network sepolia
```

У консолі побачиш:
```bash
Local SemaphoreVerifier: 0x...<адреса>
```
Скрипт також запише адресу в test-project/deployments/sepolia.v2.json.

#### 1.2 Контракт `ComplaintsV2`

```bash
npx hardhat run scripts/deploy-v2.ts --network sepolia
```

У консолі побачиш:
```bash
ComplaintsV2: 0x...<адреса>
```

> 🧾 Адреси збережуться в: `test-project/deployments/sepolia.v2.json`

---

### 👥 2. Whitelist → Merkle‑група

```bash
npx ts-node scripts/add-member.ts seed-1
npx ts-node scripts/add-member.ts seed-2
npx ts-node scripts/add-member.ts seed-3
```

**Згенеруй групу:**

```bash
npx ts-node scripts/gen-group.ts
```

У консолі побачиш:
```bash
Group depth: 2 root: 34180437...794760326635
```

> 📄 Група → `test-project/examples/group.json`

---

### ✅ 3. Дозволити root у контракті

```bash
npx hardhat run scripts/allow-root.ts --network sepolia
```

У консолі побачиш:
```bash
[dotenv@17.2.1] injecting env (3) from .env -- tip: ⚙️  suppress all logs with { quiet: true }
[dotenv@17.2.1] injecting env (0) from .env -- tip: 📡 version env with Radar: https://dotenvx.com/radar
Setting root: 3418043718406815991709179687836617871578641094909002310134264798794760326635 allowed: true
setRoot tx: 0x369dd2ddd6a9d65b736af10655884ac60917d8b44482269dd1b82c983f4898b0
```

---

### 💻 4. Запуск фронта

```bash
cd ../web
npm install
```

**Створи `.env` файл у `web/`:**

```
VITE_CONTRACT=<адреса ComplaintsV2 з ../test-project/deployments/sepolia.v2.json>
VITE_CHAIN_ID=11155111
VITE_DEFAULT_TOPIC=complaints-v1
```

**Скопіюй актуальний group.json:**

```bash
copy ../test-project/examples/group.json ./public/group.json
```

**Запусти фронт:**

```bash
npm run dev
```

> 🔗 Відкрий [http://localhost:5173](http://localhost:5173)
> Підключи гаманець → Seed: `seed-1` → Topic → Message → Generate proof → Submit

---

## 🧪 Корисні скрипти (з `test-project/`)

### 📄 Оффчейн‑перевірка пруфа

```bash
npx ts-node scripts/verify-offchain.ts
```

### 🔍 Діагностика дозволених root’ів

```bash
npx hardhat run scripts/diagnose-root.ts --network sepolia
```

### 🧠 Генерація пруфа без фронта

```bash
npx ts-node scripts/gen-proof.ts
```

### 📤 Сабміт пруфа у контракт

```bash
npx hardhat run scripts/submit-proof.ts --network sepolia
```

---

## 🔁 Оновлення whitelist

```bash
# 1. Додай учасника
npx ts-node scripts/add-member.ts seed-N

# 2. Перебудуй групу
npx ts-node scripts/gen-group.ts

# 3. Дозволь root
npx hardhat run scripts/allow-root.ts --network sepolia

# 4. Онови group.json на фронті
copy ../test-project/examples/group.json ./web/public/group.json
```

---

## ❗️ Troubleshooting

### 🔒 `Root not allowed`

> Після зміни групи не дозволили root, або фронт читає стару групу.

**Фікс:** `gen-group.ts` → `allow-root.ts` → копіювати `group.json` → перезапустити фронт.

---

### ❌ `Invalid proof`

> Невідповідність групи або повторне використання тієї ж теми.

**Фікс:** перевір актуальний `group.json`, зміни `Topic`, або використовуй інший Seed.

---

### 🔁 `Already used`

> Nullifier уже використаний (Seed + Topic).

**Фікс:** змінити Topic або Seed.

---

### 📛 `Invalid CONTRACT env value`

> Неправильна адреса контракту в `.env`.

**Фікс:** скопіюй точну адресу з `sepolia.v2.json`.

---

## 🔐 Безпека

* ❌ **Не коміть** `.env` і приватні ключі
* ❌ **Не комітьте у прод** `proof.json` та `identity.json` я закомітив їх для навчальних цілей
* ✅ Для повної анонімності використовуйте **релеєр**, щоб gas платив не користувач


---

## 🗂️ Де що лежить

| Файл/Папка                                | Призначення                                       |
| ----------------------------------------- | ------------------------------------------------- |
| `test-project/contracts/ComplaintsV2.sol` | Контракт: ZK‑верифікація, події, nullifier‑захист |
| `test-project/scripts/`                   | Скрипти деплою, whitelist, діагностики            |
| `test-project/examples/`                  | Група, учасники, identity, локальний proof        |
| `test-project/deployments/`               | Адреси контрактів                                 |
| `web/`                                    | Фронт: React + Tailwind, конфіг в `.env`          |
| `web/public/group.json`                   | Група (оновлюється вручну з test-project)         |

