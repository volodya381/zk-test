import { verifyProof, SemaphoreProof } from "@semaphore-protocol/proof";
import * as fs from "fs";
import * as path from "path";

/**
 * Офчейн‑перевірка доказу Semaphore:
 * - читає examples/proof.json і формує об’єкт SemaphoreProof;
 * - викликає verifyProof(proof) локально (без блокчейна, без газу);
 * - виводить у консоль результат: true/false.
 */

async function main() {
  const p = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../examples/proof.json"), "utf8"));
  const proof: SemaphoreProof = {
    merkleTreeDepth: p.publicSignals.treeDepth,
    merkleTreeRoot:  p.publicSignals.merkleTreeRoot,
    message:         p.publicSignals.signalHash,
    nullifier:       p.publicSignals.nullifierHash,
    scope:           p.publicSignals.externalNullifier,
    points:          p.points
  };
  const ok = await verifyProof(proof);
  console.log("Off-chain verify:", ok);
}
main().catch(console.error);
