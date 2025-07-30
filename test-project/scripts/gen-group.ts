import { Group } from "@semaphore-protocol/group";
import fs from "fs"; import path from "path";

/**
 * Будує Merkle‑групу з members.csv і зберігає результат у examples/group.json:
 * - читає список commitment-ів із ENV MEMBERS або за замовчуванням examples/members.csv;
 * - створює Group, рахує depth і root;
 * - записує { depth, members, root } у examples/group.json;
 * - логує depth і root (для контролю).
 */

async function main() {
  const src = process.env.MEMBERS ?? path.resolve(__dirname, "../examples/members.csv");
  const lines = fs.readFileSync(src, "utf8").trim().split(/\r?\n/);
  const members = lines.map(l => BigInt(l.trim()));
  const group = new Group(members);

  const outDir = path.resolve(__dirname, "../examples");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "group.json"), JSON.stringify({
    depth: group.depth,
    members: members.map(m => m.toString()),
    root: group.root.toString()
  }, null, 2));
  console.log("Group depth:", group.depth, "root:", group.root.toString());
}
main().catch(console.error);
