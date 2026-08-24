export type SqueezeSide="long_squeeze"|"short_squeeze";
export type SqueezeLevel="low"|"watch"|"elevated"|"high"|"critical";
export interface SqueezeAssessment{
 side:SqueezeSide;probability:number;level:SqueezeLevel;
 nearestZoneDistancePercent:number|null;nearestZoneIntensity:number;
 zoneConfidence:number;triggerPressure:number;oiConfirmation:number;
 liquidationConfirmation:number;dataReliability:number;reasons:string[];
}
export interface SqueezeProbabilityResult{
 symbol:"BTCUSDT";calculatedAt:string;currentPrice:number;
 longSqueeze:SqueezeAssessment;shortSqueeze:SqueezeAssessment;
 dominantRisk:SqueezeSide|"balanced";strategyVersion:"squeeze-probability-v7.14";
}
