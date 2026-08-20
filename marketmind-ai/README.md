This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Vercel deployment

This web app can be deployed independently from `market-worker`.
The recommended production split is:

- MarketMind Web: Vercel
- Market Worker: Android/Termux + PM2
- Shared data: Supabase

### Required Vercel environment variables

Set these in Vercel > Project Settings > Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

Optional, depending on enabled features:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `GITHUB_REPOSITORY`
- `GITHUB_BRANCH`
- `GITHUB_TOKEN`
- `VERCEL_ACCESS_TOKEN`
- `VERCEL_PROJECT_ID`
- `VERCEL_TEAM_ID`
- `MARKET_WORKER_HEALTH_URL`
- `MARKET_API_HEALTH_URL`
- `INTELLIGENCE_HEALTH_URL`

Never expose `SUPABASE_SECRET_KEY` with a `NEXT_PUBLIC_` prefix.

### Build settings

Vercel normally detects these automatically:

- Framework Preset: Next.js
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: leave default

The BTC chart route proxies Binance Futures kline history through `/api/market-chart` and the live chart updates in the browser.
