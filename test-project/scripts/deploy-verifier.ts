import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Деплоїть локальний SemaphoreVerifier у поточну мережу (для тестів),
 * логує його адресу та оновлює deployments/sepolia.v2.json,
 * записуючи поле SemaphoreVerifier з цією адресою.
 */

async function main() {
  const Verifier = await ethers.getContractFactory("SemaphoreVerifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const addr = await verifier.getAddress();
  console.log("Local SemaphoreVerifier:", addr);

  const out = path.resolve(__dirname, "../deployments/sepolia.v2.json");
  const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out,"utf8")) : {};
  prev.SemaphoreVerifier = addr;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(prev, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
