export interface Candle {
  openTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateEma(
  values: number[],
  period: number,
): number | null {
  if (values.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);
  let ema = average(values.slice(0, period));

  for (let index = period; index < values.length; index += 1) {
    ema =
      values[index] * multiplier +
      ema * (1 - multiplier);
  }

  return ema;
}

export function calculateRsi(
  values: number[],
  period = 14,
): number | null {
  if (values.length <= period) {
    return null;
  }

  let gainSum = 0;
  let lossSum = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];

    if (change >= 0) {
      gainSum += change;
    } else {
      lossSum += Math.abs(change);
    }
  }

  let averageGain = gainSum / period;
  let averageLoss = lossSum / period;

  for (
    let index = period + 1;
    index < values.length;
    index += 1
  ) {
    const change = values[index] - values[index - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain =
      (averageGain * (period - 1) + gain) / period;

    averageLoss =
      (averageLoss * (period - 1) + loss) / period;
  }

  if (averageLoss === 0) {
    return 100;
  }

  const relativeStrength = averageGain / averageLoss;

  return 100 - 100 / (1 + relativeStrength);
}

function calculateEmaSeries(
  values: number[],
  period: number,
): number[] {
  if (values.length < period) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const series: number[] = [];
  let ema = average(values.slice(0, period));

  series.push(ema);

  for (let index = period; index < values.length; index += 1) {
    ema =
      values[index] * multiplier +
      ema * (1 - multiplier);

    series.push(ema);
  }

  return series;
}

export function calculateMacd(values: number[]): {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
} {
  const fastPeriod = 12;
  const slowPeriod = 26;
  const signalPeriod = 9;

  if (values.length < slowPeriod + signalPeriod) {
    return {
      macd: null,
      signal: null,
      histogram: null,
    };
  }

  const fastSeries = calculateEmaSeries(values, fastPeriod);
  const slowSeries = calculateEmaSeries(values, slowPeriod);

  const offset = slowPeriod - fastPeriod;

  const macdSeries = slowSeries.map(
    (slowValue, index) =>
      fastSeries[index + offset] - slowValue,
  );

  const signalSeries = calculateEmaSeries(
    macdSeries,
    signalPeriod,
  );

  if (signalSeries.length === 0) {
    return {
      macd: null,
      signal: null,
      histogram: null,
    };
  }

  const macd = macdSeries[macdSeries.length - 1];
  const signal = signalSeries[signalSeries.length - 1];

  return {
    macd,
    signal,
    histogram: macd - signal,
  };
}

function calculateTrueRanges(candles: Candle[]): number[] {
  if (candles.length < 2) {
    return [];
  }

  const ranges: number[] = [];

  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];

    ranges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close),
      ),
    );
  }

  return ranges;
}

function calculateWilderAverage(
  values: number[],
  period: number,
): number | null {
  if (values.length < period) {
    return null;
  }

  let result = average(values.slice(0, period));

  for (let index = period; index < values.length; index += 1) {
    result =
      (result * (period - 1) + values[index]) / period;
  }

  return result;
}

export function calculateAtr(
  candles: Candle[],
  period = 14,
): number | null {
  return calculateWilderAverage(
    calculateTrueRanges(candles),
    period,
  );
}

export function calculateAdx(
  candles: Candle[],
  period = 14,
): number | null {
  if (candles.length < period * 2 + 1) {
    return null;
  }

  const trueRanges: number[] = [];
  const positiveDm: number[] = [];
  const negativeDm: number[] = [];

  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];

    const upwardMove = current.high - previous.high;
    const downwardMove = previous.low - current.low;

    positiveDm.push(
      upwardMove > downwardMove && upwardMove > 0
        ? upwardMove
        : 0,
    );

    negativeDm.push(
      downwardMove > upwardMove && downwardMove > 0
        ? downwardMove
        : 0,
    );

    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close),
      ),
    );
  }

  let smoothedTr = trueRanges
    .slice(0, period)
    .reduce((sum, value) => sum + value, 0);

  let smoothedPositiveDm = positiveDm
    .slice(0, period)
    .reduce((sum, value) => sum + value, 0);

  let smoothedNegativeDm = negativeDm
    .slice(0, period)
    .reduce((sum, value) => sum + value, 0);

  const dxValues: number[] = [];

  for (
    let index = period;
    index < trueRanges.length;
    index += 1
  ) {
    smoothedTr =
      smoothedTr -
      smoothedTr / period +
      trueRanges[index];

    smoothedPositiveDm =
      smoothedPositiveDm -
      smoothedPositiveDm / period +
      positiveDm[index];

    smoothedNegativeDm =
      smoothedNegativeDm -
      smoothedNegativeDm / period +
      negativeDm[index];

    if (smoothedTr === 0) {
      dxValues.push(0);
      continue;
    }

    const positiveDi =
      (100 * smoothedPositiveDm) / smoothedTr;

    const negativeDi =
      (100 * smoothedNegativeDm) / smoothedTr;

    const denominator = positiveDi + negativeDi;

    const dx =
      denominator === 0
        ? 0
        : (100 * Math.abs(positiveDi - negativeDi)) /
          denominator;

    dxValues.push(dx);
  }

  return calculateWilderAverage(dxValues, period);
}

export function calculateBollingerBands(
  values: number[],
  period = 20,
  deviationMultiplier = 2,
): {
  upper: number | null;
  middle: number | null;
  lower: number | null;
  width: number | null;
} {
  if (values.length < period) {
    return {
      upper: null,
      middle: null,
      lower: null,
      width: null,
    };
  }

  const recentValues = values.slice(-period);
  const middle = average(recentValues);

  const variance =
    recentValues.reduce(
      (sum, value) => sum + (value - middle) ** 2,
      0,
    ) / period;

  const standardDeviation = Math.sqrt(variance);
  const upper =
    middle + deviationMultiplier * standardDeviation;
  const lower =
    middle - deviationMultiplier * standardDeviation;

  return {
    upper,
    middle,
    lower,
    width: middle === 0 ? 0 : (upper - lower) / middle,
  };
}

export function calculateVolumeMetrics(
  volumes: number[],
  period = 20,
): {
  volumeMa: number | null;
  volumeRatio: number | null;
} {
  if (volumes.length < period) {
    return {
      volumeMa: null,
      volumeRatio: null,
    };
  }

  const volumeMa = average(volumes.slice(-period));
  const currentVolume = volumes[volumes.length - 1];

  return {
    volumeMa,
    volumeRatio:
      volumeMa === 0 ? 0 : currentVolume / volumeMa,
  };
}

export function calculateObv(
  candles: Candle[],
): number | null {
  if (candles.length === 0) {
    return null;
  }

  let obv = 0;

  for (let index = 1; index < candles.length; index += 1) {
    if (candles[index].close > candles[index - 1].close) {
      obv += candles[index].volume;
    } else if (
      candles[index].close < candles[index - 1].close
    ) {
      obv -= candles[index].volume;
    }
  }

  return obv;
}

export function calculateMfi(
  candles: Candle[],
  period = 14,
): number | null {
  if (candles.length <= period) {
    return null;
  }

  const startIndex = candles.length - period;
  let positiveFlow = 0;
  let negativeFlow = 0;

  for (
    let index = startIndex;
    index < candles.length;
    index += 1
  ) {
    const current = candles[index];
    const previous = candles[index - 1];

    const currentTypicalPrice =
      (current.high + current.low + current.close) / 3;

    const previousTypicalPrice =
      (previous.high + previous.low + previous.close) / 3;

    const moneyFlow =
      currentTypicalPrice * current.volume;

    if (currentTypicalPrice > previousTypicalPrice) {
      positiveFlow += moneyFlow;
    } else if (
      currentTypicalPrice < previousTypicalPrice
    ) {
      negativeFlow += moneyFlow;
    }
  }

  if (negativeFlow === 0) {
    return 100;
  }

  const moneyFlowRatio = positiveFlow / negativeFlow;

  return 100 - 100 / (1 + moneyFlowRatio);
}