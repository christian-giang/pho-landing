/* Produces the OWNER_PASSWORD_HASH value for the /admin login.
   Usage: npm run hash-password -- "the password"  (or omit to be prompted) */
import crypto from "node:crypto";
import readline from "node:readline/promises";

let password = process.argv[2];
if (!password) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  password = await rl.question("Passwort: ");
  rl.close();
}
if (!password) {
  console.error("No password given.");
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 32);
console.log(`${salt.toString("hex")}:${hash.toString("hex")}`);
