"use client";

import Link from "next/link";
import { LoadState } from "@/components/ui";
import type { DemoView } from "@/api/views";
import { useApi } from "@/lib/api";
import { PeerButtons, PersonaButtons } from "./PersonaButtons";

const SCENARIOS = [
  { title: "새로운 학습 시작", steps: "‘처음 온 학습자’ → 학습 탭 → 난이도 + 문제 유형(예: 객관식·오류 찾기) 선택 → 시작", href: "/learn", check: "고른 유형의 문제만 나오는지, 선택 단계가 부담스럽지 않은지" },
  { title: "학습과 복습 구분", steps: "‘map·filter 를 혼동하는 학습자’ → 복습 탭 → 오답 노트 → 다시 풀기 / 복습 세트 시작", href: "/review", check: "틀린 문제가 모여 있는지, 맞히면 오답 노트에서 빠지는지" },
  { title: "랭킹", steps: "아래 ‘가상 참가자 30명 추가’ → 랭킹 탭에서 내 등수·상위 % 확인 → 이름 바꾸기", href: "/ranking", check: "내 위치가 한눈에 보이는지, 부담스럽지 않은 표현인지" },
  { title: "하나의 코드, 여러 질문", steps: "초급 · filter 세션에서 같은 코드로 객관식 → 빈칸 → 셔플 → 오류 찾기 → 주관식", href: "/practice?concept=filter&level=3", check: "‘같은 코드, 다른 질문’ 표시, 코드·질문·답 영역 구분" },
  { title: "주관식 AI 평가", steps: "주관식에 ‘filter 는 배열의 값을 변경해요’ 처럼 일부러 오개념을 섞어 제출", href: "/practice?concept=filter&level=3", check: "규칙으로 바로 정답 처리되는 답과 AI 로 넘어가는 답의 차이, AI Tutor 영역" },
  { title: "재고 부족 → AI 생성", steps: "중급 · reduce 시작 (공개 문제 0개 칸) → 관리자 화면에서 생성 작업 확인", href: "/practice?concept=reduce&level=4", check: "가까운 난이도 문제로 바로 학습이 이어지는지, 생성 → 검증 실패 → 재생성 → 공개 흐름" },
  { title: "학습자 분석과 맞춤 복습", steps: "‘map·filter 를 혼동하는 학습자’ → 내 학습", href: "/dashboard", check: "AI 분석 카드의 혼동 개념, 반복 오답. 맞춤 복습 세트는 그 칸에 복습할 문제가 부족할 때만 만들어져요 (관리자 화면 생성 기록)" },
  { title: "운영자 화면", steps: "관리자 화면에서 칸별 재고·수요·생성 기준·비용 확인", href: "/admin", check: "어떤 칸이 왜 생성되는지 한눈에 보이는지" },
];

export function DemoClient() {
  const { data, error, slow, reload } = useApi<DemoView>("/demo");
  if (!data) return <div className="px-4">{<LoadState error={error} slow={slow} onRetry={reload} />}</div>;
  const mode = data.mode;
  return (
    <div className="mx-auto max-w-4xl px-4 pb-28 pt-8 sm:pb-16">
      <h1 className="text-[26px] font-extrabold tracking-tight">데모 · UI/UX 확인</h1>
      <p className="mt-1 text-ink-500">
        현재 AI 모드: <b className="text-ink-700">{mode === "mock" ? "🧪 목업 (흉내 낸 AI 응답)" : mode === "live" ? "✨ 실제 AI" : "📘 AI 꺼짐 (규칙 채점·저장된 해설만)"}</b>
        {mode !== "mock" && " · 데모 데이터는 목업 모드(AI_MODE=mock)에서만 바꿀 수 있어요."}
      </p>

      <section className="mt-6">
        <h2 className="mb-3 font-bold">1. 학습자 상태 고르기</h2>
        <p className="mb-3 text-sm text-ink-500">지금 창의 학습 기록을 지우고, 고른 학습자의 가상 기록으로 바꿔요.</p>
        <PersonaButtons personas={data.personas} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-bold">2. 랭킹 확인용 가상 참가자</h2>
        <p className="mb-3 text-sm text-ink-500">혼자서는 랭킹이 1등만 보여서, XP 가 다양한 가상 학습자를 넣고 뺄 수 있어요.</p>
        <PeerButtons />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-bold">3. 확인할 시나리오</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SCENARIOS.map((s, i) => (
            <Link key={s.title} href={s.href} className="card block p-5 transition hover:shadow-lift">
              <p className="font-mono text-xs font-bold text-ink-400">0{i + 1}</p>
              <p className="mt-1 font-bold">{s.title}</p>
              <p className="mt-1 text-sm text-ink-700">{s.steps}</p>
              <p className="mt-2 text-xs text-ink-400">확인할 점: {s.check}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
