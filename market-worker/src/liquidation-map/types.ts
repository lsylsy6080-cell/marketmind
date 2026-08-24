export type LiquidationZoneSide = "long" | "short";

export interface LeverageBucket {
  leverage: number;
  weight: number;
}

export interface EstimatedLiquidationZone {
  side: LiquidationZoneSide;
  priceLow: number;
  priceHigh: number;
  centerPrice: number;
  distanceFromCurrentPercent: number;
  intensity: number;
  confidence: number;
  estimatedRiskUsd: number;
  sourceClusterCount: number;
  contributingClusterCenters: number[];
  leverageMix: Record<string, number>;
}

export interface EstimatedLiquidationMap {
  symbol: "BTCUSDT";
  calculatedAt: string;
  currentPrice: number;
  sourceMapId: number | null;
  maintenanceMarginRate: number;
  leverageDistribution: LeverageBucket[];
  longZones: EstimatedLiquidationZone[];
  shortZones: EstimatedLiquidationZone[];
  nearestLongZone: EstimatedLiquidationZone | null;
  nearestShortZone: EstimatedLiquidationZone | null;
  strongestLongZone: EstimatedLiquidationZone | null;
  strongestShortZone: EstimatedLiquidationZone | null;
  strategyVersion: "estimated-liquidation-map-v7.13";
}
