import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

function toBI(x: any) { return BigInt(x); }

/**
 * Діагностика root'ів:
 * - Читає адресу ComplaintsV2 з deployments/sepolia.v2.json і підключається до контракту.
 * - Зчитує root із examples/group.json та merkleTreeRoot із examples/proof.json.
 * - Виводить обидва значення та перевіряє у контракті allowedRoots для кожного.
 *   Допомагає зрозуміти, чи дозволено поточний group/proof root на ончейні.
 */

async function main() {
  const depPath = path.resolve(__dirname, "../deployments/sepolia.v2.json");
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));
  const addr = dep.ComplaintsV2;
  if (!addr) throw new Error("No ComplaintsV2 in deployments/sepolia.v2.json");

  const c = await ethers.getContractAt("ComplaintsV2", addr);
  console.log("ComplaintsV2 address:", addr);

  const group = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../examples/group.json"), "utf8"));
  const groupRoot = toBI(group.root);

  const proof = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../examples/proof.json"), "utf8"));
  const proofRoot = toBI(proof.publicSignals.merkleTreeRoot);

  console.log("group.json root:", groupRoot.toString());
  console.log("proof.json  root:", proofRoot.toString());

  const allowedGroup = await c.allowedRoots(groupRoot);
  const allowedProof = await c.allowedRoots(proofRoot);

  console.log("allowed[groupRoot]:", allowedGroup);
  console.log("allowed[proofRoot]:", allowedProof);
}

main().catch((e) => { console.error(e); process.exit(1); });
