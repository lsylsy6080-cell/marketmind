export type MarketType = "spot" | "futures";
export type ProfileWindow = "24h" | "7d" | "30d";
export type StructureTimeframe = "15m" | "1h" | "4h" | "1d";
export interface CandleRow { openTime:string; open:number; high:number; low:number; close:number; volume:number; quoteVolume:number; }
export interface VolumeNode { price:number; volume:number; sharePercent:number; }
export interface VolumeProfile { marketType:MarketType; window:ProfileWindow; sourceTimeframe:string; candleCount:number; low:number; high:number; poc:number; hvn:VolumeNode[]; lvn:VolumeNode[]; }
export interface SwingLevel { price:number; kind:"support"|"resistance"; timeframe:StructureTimeframe; marketType:MarketType; observedAt:string; }
export interface SRLevel { price:number; strength:number; distancePercent:number; kind:"support"|"resistance"; sources:string[]; }
export interface Phase81Result { symbol:"BTCUSDT"; calculatedAt:string; currentPrice:number; profiles:VolumeProfile[]; nearestSupport:SRLevel|null; nextSupport:SRLevel|null; nearestResistance:SRLevel|null; nextResistance:SRLevel|null; supportLevels:SRLevel[]; resistanceLevels:SRLevel[]; performance:{loadMs:number;profileMs:number;structureMs:number;saveMs:number;totalMs:number;rssMb:number;heapMb:number}; strategyVersion:"phase8-market-structure-v8.1"; }
