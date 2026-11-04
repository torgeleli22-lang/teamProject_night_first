"use client";

import { useEffect, useState } from "react";
import { Waiting } from "@/components/ui";
import { type Language, LANGUAGE_NAMES, type Level } from "@/lib/api-types";

/**
 * 연습 코드를 기다리는 동안 (jojo_practice 의 단계, docs/GENERATION_STANDARD.md 0장):
 * ① AI 가 코드를 씀 → ② 규칙 검사 → ③ 검토 AI 가 실행하듯 따라가며 동작·난이도 확인 → 걸리면 고치거나 다시.
 * 서버가 단계를 알려 주지 않아서, 걸린 시간으로 지금쯤의 단계를 보여 준다 (고급은 더 오래 씀).
 */
export function MakingCode({ language, level }: { language: Language; level: Level }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const write = [10, 20, 40][level - 1]; // 코드를 쓰는 데 보통 걸리는 시간 (초)
  const review = [15, 25, 50][level - 1]; // 검토에 보통 걸리는 시간 (초)
  const steps = [
    `AI 가 ${LANGUAGE_NAMES[language]} 코드를 쓰고 있어요`,
    "문법과 오타를 규칙으로 검사해요",
    "다른 AI 가 값을 넣어 실행하듯 따라가며 동작하는지, 난이도가 맞는지 확인하고 채점 기준을 만들어요",
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
        {sec > write + 2 + review && <li className="text-pen-red">고칠 곳이 나오면 고치거나 다시 만들어서 조금 더 걸릴 수 있어요.</li>}
      </ol>
    </div>
  );
}
