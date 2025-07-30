import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { keccak256 } from "ethers";
import { toBeHex } from "ethers";

/**
 * Відправляє ZK‑доказ із examples/proof.json у контракт ComplaintsV2.
 * - Читає адресу контракту з deployments/sepolia.v2.json.
 * - Завантажує proof.json і готує аргументи: pA/pB/pC та pubSignals.
 *   pubSignals = [root, nullifier, hash(message), hash(scope)], де
 *   hash(x) = uint256(keccak256(abi.encodePacked(x))) >> 8 — як у Semaphore.
 * - Берe depth із proof.publicSignals.treeDepth.
 * - Спочатку робить staticCall submit(...) (dry‑run без газу).
 * - Якщо перевірка проходить — надсилає реальну транзакцію і логує її хеш.
 */

function toBI(x: string | number | bigint) { return BigInt(x as any); }

function fieldHash(x: string | number | bigint): bigint {
  const h = keccak256(toBeHex(x as any, 32));
  return BigInt(h) >> 8n;
}

function toABCFromPoints(points: (string | number | bigint)[]) {
  if (!Array.isArray(points) || points.length !== 8) {
    throw new Error("Invalid points array: expected 8 elements");
  }
  const p = points.map((x) => BigInt(x as any));
  const pA: [bigint, bigint] = [p[0], p[1]];
  const pB: [[bigint, bigint], [bigint, bigint]] = [[p[2], p[3]], [p[4], p[5]]];
  const pC: [bigint, bigint] = [p[6], p[7]];
  return { pA, pB, pC };
}


async function main() {
  const depPath = path.resolve(__dirname, "../deployments/sepolia.v2.json");
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));
  const complaints = await ethers.getContractAt("ComplaintsV2", dep.ComplaintsV2);

  const proofPath = path.resolve(__dirname, "../examples/proof.json");
  const proofFile = JSON.parse(fs.readFileSync(proofPath, "utf8"));

  const ps = proofFile.publicSignals;
  const pubSignals: [bigint, bigint, bigint, bigint] = [
    toBI(ps.merkleTreeRoot),
    toBI(ps.nullifierHash),

    fieldHash(ps.signalHash),
    fieldHash(ps.externalNullifier),

  ];

  const depth: number = ps.treeDepth;
  const { pA, pB, pC } = toABCFromPoints(proofFile.points as string[]);

  console.log("Submitting ZK proof...");
  try {
    await complaints.getFunction("submit").staticCall(pA as any, pB as any, pC as any, pubSignals as any, depth);
    console.log("ComplaintsV2.staticCall submit => ✅ would pass");
  } catch (e:any) {
    console.log("ComplaintsV2.staticCall submit => ❌ revert:", e.shortMessage ?? e.message ?? e);
    return; 
  }
  const tx = await complaints.submit(pA as any, pB as any, pC as any, pubSignals as any, depth);
  const rec = await tx.wait();
  console.log("OK. Tx:", rec?.hash);
}

main().catch((e) => { console.error(e); process.exit(1); });
