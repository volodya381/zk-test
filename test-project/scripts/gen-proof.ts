import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

/**
 * Генерує ZK‑доказ Semaphore і зберігає його в examples/proof.json:
 * - читає seed з examples/identity.json і members з examples/group.json;
 * - створює Identity та Group (depth беремо з group.depth);
 * - задає message ("Pizza was cold") і topicId = keccak("complaints-v1");
 * - викликає generateProof(identity, group, message, topicId, depth);
 * - формує { publicSignals, points } і записує у proof.json;
 * - логує root та depth для контролю.
 */

async function main() {
  const base = path.resolve(__dirname, "../examples");
  const { seed } = JSON.parse(fs.readFileSync(path.join(base, "identity.json"), "utf8"));
  const { members } = JSON.parse(fs.readFileSync(path.join(base, "group.json"), "utf8"));

  const identity = new Identity(seed);

  const group = new Group(members.map((m: string) => BigInt(m)));

  const messageText = "Pizza was cold";
  const topicId = BigInt(ethers.id("complaints-v1"));

  const depth = group.depth;

  const proof = await generateProof(identity, group, messageText, topicId, depth);

  const out = {
    publicSignals: {
      merkleTreeRoot: proof.merkleTreeRoot,
      nullifierHash: proof.nullifier,
      signalHash: proof.message,
      externalNullifier: proof.scope,
      treeDepth: proof.merkleTreeDepth
    },
    points: proof.points
  };

  fs.writeFileSync(path.join(base, "proof.json"), JSON.stringify(out, null, 2));
  console.log("OK: proof generated. Root:", out.publicSignals.merkleTreeRoot, "depth:", out.publicSignals.treeDepth);
}
main().catch(console.error);
