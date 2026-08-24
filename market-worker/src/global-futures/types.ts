export type FuturesExchange="binance"|"okx"|"bybit"|"gate"|"mexc";

export interface ExchangeFuturesSnapshot{
  exchange:FuturesExchange;
  symbol:string;
  fetchedAt:string;
  lastPrice:number|null;
  markPrice:number|null;
  volume24hBase:number|null;
  turnover24hUsd:number|null;
  openInterestBase:number|null;
  openInterestUsd:number|null;
  fundingRate:number|null;
  takerBuyUsd:number|null;
  takerSellUsd:number|null;
  takerBuyRatio:number|null;
  available:boolean;
  error:string|null;
}

export interface GlobalFuturesSnapshot{
  symbol:"BTCUSDT";
  fetchedAt:string;
  exchangeCount:number;
  healthyExchangeCount:number;
  totalTurnover24hUsd:number;
  totalOpenInterestUsd:number;
  weightedFundingRate:number|null;
  globalTakerBuyRatio:number|null;
  globalTakerSellRatio:number|null;
  takerSourceCount:number;
  takerSourceCoveragePercent:number;
  exchanges:ExchangeFuturesSnapshot[];
  strategyVersion:"global-futures-intelligence-v7.11.2-taker5";
}
