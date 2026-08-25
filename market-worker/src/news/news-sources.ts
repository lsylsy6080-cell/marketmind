export interface NewsSource {
  name: string;
  feedUrl: string;
  language: "en";
  asset: "BTC";
  enabled: boolean;
  sourceWeight: number;
}

// 무료 공개 RSS 중심. 개별 소스 장애는 collector에서 격리되어 전체 파이프라인을 중단하지 않는다.
export const NEWS_SOURCES: NewsSource[] = [
  {
    name: "CoinDesk",
    feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    language: "en",
    asset: "BTC",
    enabled: true,
    sourceWeight: 1.0,
  },
  {
    name: "Decrypt",
    feedUrl: "https://decrypt.co/feed",
    language: "en",
    asset: "BTC",
    enabled: true,
    sourceWeight: 0.94,
  },
  {
    name: "Cointelegraph",
    feedUrl: "https://cointelegraph.com/rss",
    language: "en",
    asset: "BTC",
    enabled: true,
    sourceWeight: 0.9,
  },
  {
    name: "Bitcoin Magazine",
    feedUrl: "https://bitcoinmagazine.com/.rss/full/",
    language: "en",
    asset: "BTC",
    enabled: true,
    sourceWeight: 0.91,
  },
  {
    name: "Blockworks",
    feedUrl: "https://blockworks.co/feed",
    language: "en",
    asset: "BTC",
    enabled: true,
    sourceWeight: 0.96,
  },
];
