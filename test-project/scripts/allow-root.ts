import "dotenv/config";
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Виставляє/знімає дозволи для Merkle-root у контракті ComplaintsV2:
 * бере адресу контракту з deployments/sepolia.v2.json, root — з ENV (ROOT) або examples/group.json,
 * читає прапорець ALLOWED (за замовчуванням true), викликає setRoot(root, allowed) і логить хеш транзакції.
 */
async function main() {
  const dep = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../deployments/sepolia.v2.json"), "utf8"));
  const complaints = await ethers.getContractAt("ComplaintsV2", dep.ComplaintsV2);

  const envRoot = process.env.ROOT;
  const root = envRoot ?? JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../examples/group.json"), "utf8")
  ).root;

  const allowed = (process.env.ALLOWED ?? "true") === "true";

  console.log("Setting root:", root, "allowed:", allowed);
  const tx = await complaints.setRoot(root, allowed);
  const rec = await tx.wait();
  console.log("setRoot tx:", rec?.hash);
}
main().catch(console.error);
