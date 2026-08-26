export interface NewsSource {
  name: string;
  feedUrl: string;
  language: "en";
  asset: "BTC";
  enabled: boolean;
  sourceWeight: number;
}

export const NEWS_SOURCES: NewsSource[] = [
  { name:"CoinDesk", feedUrl:"https://www.coindesk.com/arc/outboundfeeds/rss/", language:"en", asset:"BTC", enabled:true, sourceWeight:1.00 },
  { name:"The Block", feedUrl:"https://www.theblock.co/rss.xml", language:"en", asset:"BTC", enabled:true, sourceWeight:0.98 },
  { name:"Blockworks", feedUrl:"https://blockworks.co/feed", language:"en", asset:"BTC", enabled:true, sourceWeight:0.96 },
  { name:"Decrypt", feedUrl:"https://decrypt.co/feed", language:"en", asset:"BTC", enabled:true, sourceWeight:0.94 },
  { name:"Bitcoin Magazine", feedUrl:"https://bitcoinmagazine.com/feed", language:"en", asset:"BTC", enabled:true, sourceWeight:0.93 },
  { name:"Cointelegraph", feedUrl:"https://cointelegraph.com/rss", language:"en", asset:"BTC", enabled:true, sourceWeight:0.90 },
  { name:"CryptoSlate", feedUrl:"https://cryptoslate.com/feed/", language:"en", asset:"BTC", enabled:true, sourceWeight:0.84 },
  { name:"The Defiant", feedUrl:"https://thedefiant.io/feed/", language:"en", asset:"BTC", enabled:true, sourceWeight:0.82 },
  { name:"Protos", feedUrl:"https://protos.com/feed", language:"en", asset:"BTC", enabled:true, sourceWeight:0.82 },
];
