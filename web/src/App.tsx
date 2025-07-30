/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import {
  BrowserProvider,
  Contract,
  Interface,
  id as keccakId,
  isAddress,
  keccak256,
} from "ethers";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof, verifyProof as verifyProofOffchain } from "@semaphore-protocol/proof";

declare global {
  interface Window { ethereum?: any }
}

/** --------- Тип локального запису про скаргу (в пам'яті) --------- */
type Submission = {
  ts: number;
  txHash: string;
  topic: string;
  message: string;

  root: string;        // decimal
  nullifier: string;   // decimal
  messageRaw: string;  // decimal (proof.message)
  scopeRaw: string;    // decimal (proof.scope)

  messageHashHex: string; // bytes32 (як on-chain)
  scopeHashHex: string;   // bytes32

  onchainMessageHashHex?: string; // із події
  verified?: boolean;             // збіг із on-chain
};

type GroupFile = { depth: number; members: string[]; root: string };

const CONTRACT = (import.meta.env.VITE_CONTRACT as string || "").trim();
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 11155111);
const DEFAULT_TOPIC = (import.meta.env.VITE_DEFAULT_TOPIC as string) || "complaints-v1";

const ABI = [
  "function allowedRoots(uint256) view returns (bool)",
  "function submit(uint[2], uint[2][2], uint[2], uint[4], uint256) external"
] as const;

/** ---- мапінг точок доказу у формат Solidity ---- */
function toABC(points: (string | number | bigint)[]) {
  const p = points.map((x) => BigInt(x as any));
  const pA: [bigint, bigint] = [p[0], p[1]];
  const pB: [[bigint, bigint], [bigint, bigint]] = [[p[2], p[3]], [p[4], p[5]]];
  const pC: [bigint, bigint] = [p[6], p[7]];
  return { pA, pB, pC };
}
// альтернативний порядок pB (деякі веріфаєри очікують саме так)
function toABC_altB(points: (string | number | bigint)[]) {
  const p = points.map((x) => BigInt(x as any));
  const pA: [bigint, bigint] = [p[0], p[1]];
  const pB: [[bigint, bigint], [bigint, bigint]] = [[p[3], p[2]], [p[5], p[4]]];
  const pC: [bigint, bigint] = [p[6], p[7]];
  return { pA, pB, pC };
}

/** ---- допоміжні хеш‑функції (як у контракті) ---- */
// 32‑байтний hex (імітуємо abi.encodePacked(uint256))
function toHex32(x: bigint): string {
  let h = x.toString(16);
  if (h.length % 2) h = "0" + h;
  while (h.length < 64) h = "0".repeat(64 - h.length) + h;
  return "0x" + h;
}
// як у Semaphore.sol: uint256(keccak256(abi.encodePacked(x))) >> 8
function hashField(x: bigint): bigint {
  const h = keccak256(toHex32(x)); // 0x...
  return (BigInt(h) >> 8n);
}

/** ---- спроба staticCall з логами ---- */
async function tryStatic(
  contract: any,
  args: { pA: any; pB: any; pC: any; pub: [bigint, bigint, bigint, bigint]; depth: number },
  label: string
) {
  try {
    await contract.getFunction("submit").staticCall(args.pA, args.pB, args.pC, args.pub, args.depth);
    return { ok: true as const, label };
  } catch (e: any) {
    const msg = e?.shortMessage ?? e?.message ?? String(e);
    return { ok: false as const, label, error: msg };
  }
}

/** ---------- EIP-6963 Discovery (вибір wallet) ---------- */
type EIP6963Provider = {
  info: { uuid: string; name: string; icon?: string; rdns?: string };
  provider: any;
};
function useWalletDiscovery() {
  const [providers, setProviders] = useState<EIP6963Provider[]>([]);
  useEffect(() => {
    function onAnnounce(e: any) {
      const detail = e.detail as EIP6963Provider;
      setProviders((prev) =>
        prev.some((p) => p.info.uuid === detail.info.uuid) ? prev : [...prev, detail]
      );
    }
    window.addEventListener("eip6963:announceProvider", onAnnounce as any);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const t = setTimeout(() => {
      if (window.ethereum) {
        setProviders((prev) =>
          prev.length ? prev : [{ info: { uuid: "injected", name: "Injected" }, provider: window.ethereum }]
        );
      }
    }, 400);
    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as any);
      clearTimeout(t);
    };
  }, []);
  return providers;
}
/** -------------------------------------------------------- */

export default function App() {
  /** локальний журнал скарг (у пам'яті) */
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const wallets = useWalletDiscovery();
  const [selectedUuid, setSelectedUuid] = useState<string | null>(localStorage.getItem("walletUuid"));
  const selectedWallet = useMemo(
    () => wallets.find((w) => w.info.uuid === selectedUuid) || null,
    [wallets, selectedUuid]
  );

  const [account, setAccount] = useState<string>("");
  const [seed, setSeed] = useState("seed-1");
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [message, setMessage] = useState("Pizza was cold");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);

  const shortAddr = useMemo(
    () => (account ? `${account.slice(0, 6)}…${account.slice(-4)}` : ""),
    [account]
  );

  async function connect(chosen?: EIP6963Provider) {
    try {
      setStatus("");
      const target = chosen?.provider ?? selectedWallet?.provider;
      if (!target) {
        setStatus("❌ No wallet providers found. Install MetaMask / Trust / Coinbase / OKX.");
        return;
      }
      const provider = new BrowserProvider(target);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== CHAIN_ID) {
        await target.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xaa36a7" /* 11155111 */ }]
        });
      }
      const w = chosen ?? selectedWallet!;
      setSelectedUuid(w.info.uuid);
      localStorage.setItem("walletUuid", w.info.uuid);
      setAccount(await signer.getAddress());
      setWalletMenuOpen(false);
    } catch (e: any) {
      setStatus(`❌ Connect error: ${e?.shortMessage ?? e?.message ?? String(e)}`);
    }
  }

  async function submit() {
    try {
      if (!isAddress(CONTRACT)) {
        setStatus(`❌ Invalid CONTRACT env value: "${CONTRACT}". Перевір web/.env (без коментарів).`);
        return;
      }
      if (!selectedWallet?.provider) {
        setStatus("❌ Select and connect a wallet first.");
        return;
      }

      setBusy(true);
      setStatus("📦 Loading group…");
      const res = await fetch("/group.json");
      const groupFile: GroupFile = await res.json();
      const group = new Group(groupFile.members.map((m) => BigInt(m)));
      const depth = group.depth;

      setStatus("🧩 Building identity…");
      const identity = new Identity(seed);

      const topicId = BigInt(keccakId(topic));

      setStatus("🔐 Generating ZK proof…");
      const proof = await generateProof(identity, group, message, topicId, depth);

      // офчейн‑перевірка надійності пруфа
      const okOff = await verifyProofOffchain({
        merkleTreeDepth: proof.merkleTreeDepth,
        merkleTreeRoot:  proof.merkleTreeRoot,
        message:         proof.message,
        nullifier:       proof.nullifier,
        scope:           proof.scope,
        points:          proof.points
      });
      if (!okOff) {
        setStatus("❌ Off-chain verification failed (proof invalid).");
        return;
      }

      // публічні сигнали (Decimal у вигляді BigInt)
      const root       = BigInt(proof.merkleTreeRoot);
      const nullifier  = BigInt(proof.nullifier);
      const messageRaw = BigInt(proof.message);
      const scopeRaw   = BigInt(proof.scope);
      const messageHashed = hashField(messageRaw);
      const scopeHashed   = hashField(scopeRaw);

      const A = toABC(proof.points);
      const B = toABC_altB(proof.points);

      const PUB_RAW:    [bigint, bigint, bigint, bigint] = [root, nullifier, messageRaw,   scopeRaw];
      const PUB_SWAP:   [bigint, bigint, bigint, bigint] = [root, nullifier, scopeRaw,     messageRaw];
      const PUB_HASH:   [bigint, bigint, bigint, bigint] = [root, nullifier, messageHashed,scopeHashed];
      const PUB_HASH_S: [bigint, bigint, bigint, bigint] = [root, nullifier, scopeHashed,  messageHashed];

      const browserProvider = new BrowserProvider(selectedWallet.provider);
      const signer = await browserProvider.getSigner();
      const contract = new Contract(CONTRACT, ABI, signer);

      const allowed = await contract.allowedRoots(root);
      if (!allowed) {
        setStatus("❌ Root not allowed on-chain. Запусти allow-root.ts для поточного group.json");
        return;
      }

      setStatus("🧪 Static check (trying encodings)...");
      const tries = [
        { args: { ...A, pub: PUB_RAW,     depth }, label: "A + RAW" },
        { args: { ...A, pub: PUB_SWAP,    depth }, label: "A + SWAP" },
        { args: { ...B, pub: PUB_RAW,     depth }, label: "B + RAW" },
        { args: { ...B, pub: PUB_SWAP,    depth }, label: "B + SWAP" },
        { args: { ...A, pub: PUB_HASH,    depth }, label: "A + HASH" },
        { args: { ...A, pub: PUB_HASH_S,  depth }, label: "A + HASH_SWAP" },
        { args: { ...B, pub: PUB_HASH,    depth }, label: "B + HASH" },
        { args: { ...B, pub: PUB_HASH_S,  depth }, label: "B + HASH_SWAP" },
      ] as const;

      const results: { label: string; ok: boolean; error?: string }[] = [];
      let chosen: { label: string; args: any } | null = null;
      for (const t of tries) {
        const r = await tryStatic(contract, t.args as any, t.label);
        results.push({ label: t.label, ok: r.ok, error: (r as any).error });
        if (r.ok) { chosen = { label: t.label, args: t.args }; break; }
      }

      if (!chosen) {
        console.warn("Proof debug:", {
          depth,
          root: root.toString(),
          nullifier: nullifier.toString(),
          messageRaw: messageRaw.toString(),
          scopeRaw: scopeRaw.toString(),
          messageHashed: messageHashed.toString(),
          scopeHashed: scopeHashed.toString(),
          tries: results
        });
        setStatus(
          "❌ Revert on staticCall: Invalid proof\n" +
          results.map(r => ` - ${r.label}: ${r.ok ? "OK" : r.error}`).join("\n")
        );
        return;
      }

      setStatus(`⏳ Sending tx with encoding: ${chosen.label} …`);
      const { pA, pB, pC, pub, depth: d } = chosen.args;
      const tx = await contract.submit(pA, pB, pC, pub, d);
      setStatus(`⏳ Pending: ${tx.hash}`);
      const rec = await tx.wait();
      setStatus(`✅ Success: ${rec?.hash} (mode ${chosen.label})`);

      /** --------- Локальний запис + звірка з подією --------- */
      const messageHashHex = toHex32(messageHashed);
      const scopeHashHex   = toHex32(scopeHashed);

      // спробуємо підтягнути з події messageHash (bytes32)
      let onchainMessageHashHex: string | undefined;
      let verified: boolean | undefined;
      try {
        const EV_ABI = [
          "event ComplaintSubmitted(uint256 indexed root,uint256 indexed nullifierHash,uint256 indexed topicId,bytes32 messageHash)"
        ];
        const iface = new Interface(EV_ABI);
        const receipt = await signer.provider!.getTransactionReceipt(rec!.hash);
        for (const log of receipt!.logs) {
          if (log.address.toLowerCase() === CONTRACT.toLowerCase()) {
            const parsed = iface.parseLog(log);
            if (parsed?.name === "ComplaintSubmitted") {
              onchainMessageHashHex = parsed.args.messageHash as string;
              break;
            }
          }
        }
        verified = !!onchainMessageHashHex && onchainMessageHashHex.toLowerCase() === messageHashHex.toLowerCase();
      } catch {
        // no-op
      }

      // зберігаємо запис у локальний журнал
      setSubmissions((prev) => [
        {
          ts: Date.now(),
          txHash: rec!.hash,
          topic,
          message,
          root: root.toString(),
          nullifier: nullifier.toString(),
          messageRaw: messageRaw.toString(),
          scopeRaw: scopeRaw.toString(),
          messageHashHex,
          scopeHashHex,
          onchainMessageHashHex,
          verified
        },
        ...prev
      ]);
      /** ------------------------------------------------------ */

    } catch (e: any) {
      console.error(e);
      setStatus(`❌ Error: ${e?.shortMessage ?? e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-black flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">zk‑complaints</h1>
          <p className="text-sm text-gray-600 mt-1">Semaphore‑based anonymous complaints (one per topic)</p>
        </div>

        <div className="rounded-2xl border border-gray-200 shadow-sm bg-white">
          {/* Top bar */}
          <div className="flex items-center gap-2 justify-between border-b border-gray-100 px-5 py-3">
            <div className="text-xs text-gray-600">
              Contract:&nbsp;<code className="font-mono">{CONTRACT || "<not set>"}</code>
            </div>

            {/* Wallet selector */}
            <div className="relative">
              <button
                onClick={() => {
                  if (wallets.length === 1) {
                    connect(wallets[0]);
                  } else {
                    setWalletMenuOpen((v) => !v);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-black text-white px-3 py-1.5 text-sm hover:opacity-90"
              >
                {account
                  ? `Connected: ${shortAddr}`
                  : selectedWallet
                  ? `Connect (${selectedWallet.info.name})`
                  : "Connect Wallet"}
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
              </button>

              {walletMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-md z-10">
                  <div className="p-2 max-h-80 overflow-auto">
                    {wallets.length === 0 && (
                      <div className="px-3 py-2 text-sm text-gray-600">No injected wallets found</div>
                    )}
                    {wallets.map((w) => (
                      <button
                        key={w.info.uuid}
                        onClick={() => connect(w)}
                        className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-50 flex items-center gap-2"
                      >
                        {w.info.icon ? (
                          <img src={w.info.icon} alt="" className="h-4 w-4 rounded-sm" />
                        ) : (
                          <span className="h-4 w-4 rounded-sm bg-gray-300 inline-block" />
                        )}
                        <span className="flex-1">{w.info.name}</span>
                        {selectedUuid === w.info.uuid && <span className="text-green-600">●</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Form */}
          <div className="px-5 py-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Seed</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-black/20"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="seed-1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Topic</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-black/20"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="complaints-v1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Message</label>
              <textarea
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-black/20"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Your complaint…"
              />
            </div>

            <button
              onClick={submit}
              disabled={busy || !selectedWallet}
              className="w-full h-11 rounded-lg bg-black text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {busy && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4"/>
                  <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4"/>
                </svg>
              )}
              Generate proof & Submit
            </button>

            {status && (
              <div
                className={`mt-2 rounded-lg border p-3 text-sm ${
                  status.startsWith("✅")
                    ? "border-green-200 bg-green-50 text-green-800"
                    : status.startsWith("❌")
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-gray-200 bg-gray-50 text-gray-800"
                }`}
              >
                {status}
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Якщо бачиш <span className="font-mono">Root not allowed</span> — онови <span className="font-mono">web/public/group.json</span>
          &nbsp;і запусти <span className="font-mono">allow-root.ts</span> у бек‑папці.
        </p>

        {/* --------- Локальний журнал відправлень (ця сесія) --------- */}
        {submissions.length > 0 && (
          <div className="mt-8 rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="text-lg font-semibold">My local submissions (this session)</h2>
              <button
                onClick={() => setSubmissions([])}
                className="text-sm text-gray-600 hover:text-black"
              >
                Clear
              </button>
            </div>

            <div className="divide-y divide-gray-100">
              {submissions.map((s, idx) => (
                <div key={idx} className="p-5 space-y-3">
                  <div className="text-sm text-gray-500">
                    {new Date(s.ts).toLocaleString()} • Tx{" "}
                    <a
                      className="text-black underline"
                      href={`https://sepolia.etherscan.io/tx/${s.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.txHash.slice(0, 10)}…{s.txHash.slice(-8)}
                    </a>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-gray-200 p-3">
                      <div className="text-xs uppercase text-gray-500 mb-1">Plain</div>
                      <div className="text-sm"><b>Topic:</b> {s.topic}</div>
                      <div className="text-sm"><b>Message:</b> {s.message}</div>
                    </div>

                    <div className="rounded-lg border border-gray-200 p-3">
                      <div className="text-xs uppercase text-gray-500 mb-1">On‑chain view</div>
                      <div className="text-xs font-mono break-all">
                        <div><b>root</b> (dec): {s.root}</div>
                        <div><b>nullifierHash</b> (dec): {s.nullifier}</div>
                        <div><b>topicId</b> (bytes32): {s.scopeHashHex}</div>
                        <div><b>messageHash</b> (bytes32): {s.messageHashHex}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs uppercase text-gray-500 mb-1">Decode / verify</div>
                    <div className="text-xs font-mono break-all space-y-1">
                      <div><b>messageRaw</b> (dec): {s.messageRaw}</div>
                      <div><b>hash(messageRaw)»bytes32</b>: {s.messageHashHex}</div>
                      <div><b>on‑chain event messageHash</b>: {s.onchainMessageHashHex || "<not read>"}</div>
                      {typeof s.verified === "boolean" && (
                        <div className={s.verified ? "text-green-700" : "text-red-700"}>
                          {s.verified ? "✔ matches event" : "✖ differs from event"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* ----------------------------------------------------------- */}
      </div>
    </div>
  );
}
