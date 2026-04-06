export default function Refund() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 text-sm leading-relaxed" style={{ color: 'oklch(0.75 0.01 250)' }}>
      <h1 className="text-2xl font-semibold mb-2" style={{ color: 'oklch(0.92 0.01 250)' }}>환불 정책</h1>
      <p className="mb-8 text-xs" style={{ color: 'oklch(0.50 0.01 250)' }}>최종 수정일: 2026년 4월 6일</p>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>구독 환불</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>결제 후 7일 이내:</strong> 서비스를 실질적으로 이용하지 않은 경우 전액 환불 가능합니다.</li>
          <li><strong>결제 후 7일 초과:</strong> 원칙적으로 환불이 어려우나, 서비스 장애 등 귀책사유가 있는 경우 남은 기간에 비례하여 환불합니다.</li>
          <li>구독을 취소해도 현재 결제 기간 종료 시까지 서비스를 계속 이용할 수 있습니다.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>크레딧 패키지 환불</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>일회성 크레딧 패키지(저장 공간, 퀴즈 크레딧)는 구매 후 미사용 상태에서 7일 이내 환불 가능합니다.</li>
          <li>크레딧을 일부라도 사용한 경우 환불이 제한될 수 있습니다.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>환불 절차</h2>
        <p>환불 요청은 <a href="mailto:support@retrynote.cloud" className="underline" style={{ color: 'oklch(0.65 0.15 175)' }}>support@retrynote.cloud</a>로 결제 이메일과 환불 사유를 포함하여 보내주세요. 영업일 기준 3일 이내 검토 후 안내드립니다.</p>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-3" style={{ color: 'oklch(0.85 0.01 250)' }}>결제 처리</h2>
        <p>결제 및 환불은 Paddle(판매자 대리인)을 통해 처리됩니다. Paddle의 자체 환불 정책이 적용될 수 있으며, 자세한 내용은 <a href="https://www.paddle.com/legal/checkout-buyer-terms" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'oklch(0.65 0.15 175)' }}>Paddle 구매자 약관</a>을 참고해 주세요.</p>
      </section>
    </div>
  );
}
