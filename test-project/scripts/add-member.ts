import { Identity } from "@semaphore-protocol/identity";
import * as fs from "fs";
import * as path from "path";

/**
 * Допоміжна функція: гарантує, що каталоги на шляху існують.
 * Якщо їх немає — створює (рекурсивно).
 */
function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }

async function main() {
  /**
   * 1) Беремо seed із аргументів CLI.
   * Виклик виглядає так:
   *   npx ts-node scripts/add-member.ts <seed>
   * Напр., "seed-1", "seed-2" тощо.
   */
  const seed = process.argv[2];
  if (!seed) {
    console.error("Usage: npx ts-node scripts/add-member.ts <seed>");
    process.exit(1);
  }

  /**
   * 2) Створюємо Semaphore-ідентичність із цього seed.
   * Identity детермінована: той самий seed -> той самий commitment.
   */
  const id = new Identity(seed);

  /**
   * 3) Дістаємо commitment (великe число), яке і піде у whitelist.
   * У CSV зберігаємо у вигляді рядка (десяткове представлення).
   */
  const commitment = id.commitment.toString();

  /**
   * 4) Готуємо шлях до файлу members.csv у папці examples.
   * Тут зберігаємо усі commitment-и по одному в рядку.
   */
  const outDir = path.resolve(__dirname, "../examples");
  ensureDir(outDir);
  const csvPath = path.join(outDir, "members.csv");

  /**
   * 5) Якщо файлу ще немає — створюємо порожній.
   * Це спрощує подальший запис.
   */
  if (!fs.existsSync(csvPath)) fs.writeFileSync(csvPath, "");

  /**
   * 6) Читаємо наявні рядки (існуючі учасники) і прибираємо порожні.
   * Це потрібно, щоб не дублювати того самого учасника.
   */
  const lines = fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/).filter(Boolean);

  /**
   * 7) Перевірка на дубль: якщо такий commitment уже є — просто повідомляємо
   * і завершуємо роботу без змін.
   */
  if (lines.includes(commitment)) {
    console.log("Already in members.csv:", commitment);
    return;
  }

  /**
   * 8) Додаємо новий commitment у кінець файлу (з переходом рядка, якщо не перший).
   * Після цього у members.csv з’явиться новий учасник whitelist'у.
   */
  fs.appendFileSync(csvPath, (lines.length ? "\n" : "") + commitment);

  console.log("Added commitment:", commitment);
  console.log("File:", csvPath);
}

main().catch(console.error);
