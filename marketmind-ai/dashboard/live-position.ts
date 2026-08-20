import type { PaperPosition } from "./types";

export type LivePositionMetrics = {
  priceReturnPercent: number;
  grossPnl: number;
  unrealizedPnl: number;
  roiPercent: number;
  entryNotional: number;
};

export function calculateLivePositionMetrics(
  position: PaperPosition,
  currentPrice: number,
): LivePositionMetrics {
  const direction = position.side === "long" ? 1 : -1;
  const priceReturnPercent =
    ((currentPrice - position.entry_price) / position.entry_price) * 100 * direction;
  const grossPnl =
    (currentPrice - position.entry_price) * position.quantity * direction;
  const unrealizedPnl = grossPnl - position.entry_fee;
  const entryNotional = position.entry_price * position.quantity;
  const roiPercent = entryNotional > 0 ? (unrealizedPnl / entryNotional) * 100 : 0;

  return {
    priceReturnPercent,
    grossPnl,
    unrealizedPnl,
    roiPercent,
    entryNotional,
  };
}
