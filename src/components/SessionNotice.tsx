/** 로그인 없이 쓰는 동안 기록이 어디까지 남는지 알려주는 안내 */
export function SessionNotice() {
  return (
    <p className="mt-3 rounded-2xl bg-ink-100/70 px-4 py-2.5 text-xs text-ink-500">
      🔒 로그인 없이 이용 중이에요. 학습 기록은 <b className="text-ink-700">이 브라우저를 닫기 전까지만</b> 남고, 다시 접속하면 새로 시작해요.
    </p>
  );
}
