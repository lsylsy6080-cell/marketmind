import assert from "node:assert/strict";

const gateContracts=592_876_672;
const gateMultiplier=0.0001;
const gateBtc=gateContracts*gateMultiplier;
assert.equal(gateBtc,59_287.6672);
console.log("[PASS] Gate contract count × quanto_multiplier → BTC");

const mexcContracts=632_176_759;
const mexcContractSize=0.0001;
const mexcBtc=mexcContracts*mexcContractSize;
assert.equal(mexcBtc,63_217.6759);
console.log("[PASS] MEXC holdVol × contractSize → BTC");

const btcPrice=77_164.2;
assert.ok(gateBtc*btcPrice<10_000_000_000);
assert.ok(mexcBtc*btcPrice<10_000_000_000);
console.log("[PASS] Gate/MEXC OI USD가 조 단위로 폭증하지 않는다");
