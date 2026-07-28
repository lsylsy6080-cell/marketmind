export interface NewsSource {
  name: string;
  feedUrl: string;
  language: "en";
  asset: "BTC";
  enabled: boolean;
}

export const NEWS_SOURCES: NewsSource[] = [
  {
    name: "CoinDesk",
    feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    language: "en",
    asset: "BTC",
    enabled: true,
  },
  {
    name: "Decrypt",
    feedUrl: "https://decrypt.co/feed",
    language: "en",
    asset: "BTC",
    enabled: true,
  },
];
