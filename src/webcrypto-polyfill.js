// Node ortamında globalThis.crypto yoksa webcrypto'yu tanımla
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
