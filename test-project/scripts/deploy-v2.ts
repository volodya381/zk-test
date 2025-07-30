import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Деплоїть контракт ComplaintsV2 у поточну мережу.
 * - Читає deployments/sepolia.v2.json (якщо існує) і/або бере адресу SemaphoreVerifier з ENV (SEMAPHORE_VERIFIER).
 * - Якщо адреси верифікатора немає — кидає помилку.
 * - Деплоїть ComplaintsV2(verifierAddr), логує адресу.
 * - Оновлює deployments/sepolia.v2.json: зберігає SemaphoreVerifier і ComplaintsV2.
 */
async function main() {
  const depPath = path.resolve(__dirname, "../deployments/sepolia.v2.json");
  const prev = fs.existsSync(depPath) ? JSON.parse(fs.readFileSync(depPath, "utf8")) : {};

  const verifierAddr =
    prev.SemaphoreVerifier ||
    process.env.SEMAPHORE_VERIFIER;

  if (!verifierAddr) throw new Error("No SemaphoreVerifier address (deploy a local one or set SEMAPHORE_VERIFIER)");

  const ComplaintsV2 = await ethers.getContractFactory("ComplaintsV2");
  const complaintsV2 = await ComplaintsV2.deploy(verifierAddr);
  await complaintsV2.waitForDeployment();
  const complaintsV2Addr = await complaintsV2.getAddress();
  console.log("ComplaintsV2:", complaintsV2Addr);

  prev.SemaphoreVerifier = verifierAddr;
  prev.ComplaintsV2 = complaintsV2Addr;
  fs.mkdirSync(path.dirname(depPath), { recursive: true });
  fs.writeFileSync(depPath, JSON.stringify(prev, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
