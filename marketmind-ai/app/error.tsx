"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page-shell">
      <section className="empty-state">
        <div className="empty-mark">!</div>
        <h1>화면을 불러오는 중 문제가 발생했습니다.</h1>
        <p>잠시 후 다시 시도해 주세요.</p>
        <button className="primary-button" onClick={reset}>
          다시 시도
        </button>
      </section>
    </main>
  );
}
