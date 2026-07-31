// market-worker에 상태 확인 API가 아직 없을 때 사용할 예시입니다.
// Express를 사용한다면 기존 서버 파일에 아래 라우트를 추가하세요.

import express from "express";

const app = express();

app.get("/health", (_request, response) => {
  response.status(200).json({
    ok: true,
    service: "market-worker",
    status: "healthy",
    checkedAt: new Date().toISOString(),
  });
});

app.get("/health/intelligence", (_request, response) => {
  response.status(200).json({
    ok: true,
    service: "market-intelligence",
    version: "v2.1",
    status: "healthy",
    checkedAt: new Date().toISOString(),
  });
});
