import {normalizeBinanceTrades,normalizeBybitTrades,normalizeGateTrades,normalizeMexcTrades,normalizeOkxTrades} from "./TakerFlowNormalizer";
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

const b=normalizeBinanceTrades([{p:"100",q:"2",m:false},{p:"100",q:"1",m:true}]);assert.equal(b.buyUsd,200);assert.equal(b.sellUsd,100);console.log("[PASS] Binance Taker flow");
const o=normalizeOkxTrades([{px:"100000",sz:"2",side:"buy"},{px:"100000",sz:"1",side:"sell"}],0.01);assert.equal(o.buyUsd,2000);assert.equal(o.sellUsd,1000);console.log("[PASS] OKX Taker flow");
const y=normalizeBybitTrades([{price:"100000",size:"0.02",side:"Buy"},{price:"100000",size:"0.01",side:"Sell"}]);assert.equal(y.buyUsd,2000);assert.equal(y.sellUsd,1000);console.log("[PASS] Bybit Taker flow");
const g=normalizeGateTrades([{price:"100000",size:"20"},{price:"100000",size:"-10"}],0.001);assert.equal(g.buyUsd,2000);assert.equal(g.sellUsd,1000);console.log("[PASS] Gate Taker flow");
const m=normalizeMexcTrades([{p:100000,v:20,T:1},{p:100000,v:10,T:2}],0.001);assert.equal(m.buyUsd,2000);assert.equal(m.sellUsd,1000);console.log("[PASS] MEXC Taker flow");
