"use client";

import { useEffect, useState } from "react";
import { Waiting } from "@/components/ui";
import { type Language, LANGUAGE_NAMES } from "@/lib/api-types";

/**
 * 연습 코드를 기다리는 동안 (practice.make_code 의 단계):
 * ① AI 가 코드를 씀 → ② 규칙 검사 → ③ 다른 AI 가 검토 → 걸리면 한 번 더.
 * 서버가 단계를 알려 주지 않아서, 걸린 시간으로 지금쯤의 단계를 보여 준다 (고급은 더 오래 씀).
 */
export function MakingCode({ language, advanced, what = "읽기 연습용" }: { language: Language; advanced: boolean; what?: string }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const write = advanced ? 50 : 10; // 코드를 쓰는 데 보통 걸리는 시간 (초)
  const steps = [
    `AI 가 ${what} ${LANGUAGE_NAMES[language]} 코드를 쓰고 있어요${advanced ? " (고급은 1분쯤)" : ""}`,
    "문법·오타·쓰지 않기로 한 기능을 규칙으로 검사해요",
    "다른 AI 가 코드를 한 줄씩 따라가며 실행 오류와 ※ 모범 설명을 확인해요",
  ];
  const now = sec < write ? 0 : sec < write + 2 ? 1 : 2;
  return (
    <div>
      <Waiting text={`${steps[now]}…`} />
      <ol className="-mt-3 ml-7 space-y-0.5 text-xs text-ink-500">
        {steps.map((s, i) => (
          <li key={s} className={i === now ? "font-semibold text-ink-900" : ""}>
            {"①②③"[i]} {s}
          </li>
        ))}
        {sec > write + (advanced ? 40 : 20) && <li className="text-pen-red">검토에서 고칠 곳이 나오면 한 번 더 만들어서 조금 더 걸릴 수 있어요.</li>}
      </ol>
    </div>
  );
}
