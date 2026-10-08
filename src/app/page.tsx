import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { LEVELS } from "@/lib/curriculum";

const FLOW = [
  { icon: "🧩", title: "하나의 코드", text: "AI가 학습 목표에 맞춰 만든 짧은 코드를 읽어요." },
  { icon: "🔁", title: "여러 개의 질문", text: "같은 코드를 결과 예측·빈칸·셔플·오류 찾기·설명으로 다시 읽어요." },
  { icon: "✍️", title: "내 말로 설명", text: "왜 그렇게 동작하는지 내 말로 적어요." },
  { icon: "🤖", title: "AI 튜터 분석", text: "무엇을 헷갈리는지 찾아 다음 문제를 바꿔줘요." },
];

const ONE_CODE_MANY = ["객관식", "주관식", "빈칸 채우기", "코드 셔플", "실행 결과 예측", "오류 찾기", "역할 찾기"];

const FEATURES = [
  {
    icon: "🪜",
    title: "정답 대신, 단계별 힌트",
    text: "AI는 바로 답을 알려주지 않아요. 질문 → 핵심 짚기 → 문법 설명 → 방향 제시 순서로 스스로 답에 닿게 도와줘요.",
  },
  {
    icon: "🎯",
    title: "내가 헷갈리는 것을 아는 AI",
    text: "정답을 맞혀도 설명에서 map과 filter를 혼동하고 있다면 AI가 찾아내고, 그 개념 중심으로 다음 문제를 바꿔줘요.",
  },
  {
    icon: "🎚️",
    title: "내가 고르는 난이도",
    text: "입문부터 심화까지 5단계. 기록을 보고 추천 난이도를 알려주지만, 내가 원하지 않으면 바꾸지 않아요.",
  },
];

const ADULTS_CODE = `const users = [
  { name: "Kim", age: 25 },
  { name: "Lee", age: 17 },
  { name: "Park", age: 31 },
];

const adults = users.filter(user => user.age >= 20);

console.log(adults);`;

const DEMO_CODE = `const numbers = [1, 2, 3];

const result = numbers.map(n => n * 2);

console.log(result);`;

export default function LandingPage() {
  return (
    <div className="overflow-x-hidden">
      {/* Hero */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[480px] max-w-4xl rounded-full bg-gradient-to-br from-brand-200/60 via-brand-100/40 to-mint-100/50 blur-3xl" />
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 pb-16 pt-12 sm:pt-20 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-fade-up">
            <span className="chip bg-white text-brand-700 shadow-card">✨ AI 튜터와 함께하는 코드 읽기</span>
            <h1 className="mt-5 text-[34px] font-extrabold leading-[1.2] tracking-tight text-ink-900 sm:text-5xl">
              코드를 외우지 마세요.
              <br />
              <span className="text-brand-600">읽고 이해하는 것</span>부터
              <br />
              시작하세요.
            </h1>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-500">
              문법은 아는데 코드를 보면 막막했나요? 하루 10분, 짧은 코드를 읽고 결과를 예측하면서
              코드가 <b className="text-ink-700">왜</b> 그렇게 동작하는지 이해하는 힘을 길러요. 목표는 단 하나 — &ldquo;이 코드를 보면 어떤 코드인지 알 수 있다.&rdquo;
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/learn" className="btn-primary px-6 py-3.5 text-base">
                무료로 시작하기 →
              </Link>
              <Link href="/concepts" className="btn-ghost px-5 py-3.5 text-base">
                커리큘럼 보기
              </Link>
            </div>
            <p className="mt-4 text-sm text-ink-400">회원가입 없이 바로 시작 · JavaScript · 난이도 5단계</p>
          </div>

          {/* Demo card */}
          <div className="card animate-fade-up p-5 [animation-delay:120ms] sm:p-6">
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="font-semibold text-ink-500">JavaScript · map</span>
              <span className="text-ink-400">03 / 10</span>
            </div>
            <p className="mb-3 font-bold text-ink-900">이 코드의 실행 결과는 무엇일까요?</p>
            <CodeBlock code={DEMO_CODE} />
            <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm">
              {["[1, 2, 3]", "[2, 4, 6]", "[2, 3, 4]", "오류 발생"].map((c, i) => (
                <div
                  key={c}
                  className={`rounded-xl border px-3 py-2.5 ${
                    i === 1 ? "border-mint-500 bg-mint-50 font-semibold text-mint-700" : "border-ink-200 text-ink-500"
                  }`}
                >
                  {c}
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-mint-50 p-4 text-sm leading-relaxed text-ink-700">
              <p className="font-bold text-mint-700">🤖 AI Tutor · 정답은 맞았어요!</p>
              <p className="mt-1">그런데 설명을 보니 map과 filter의 차이를 조금 혼동하고 있는 것 같아요. map은 고르지 않고 모든 요소를 변환해요.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Flow */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">한 문제는 이렇게 흘러가요</h2>
        <p className="mt-2 text-center text-ink-500">읽기 → 예측 → 설명 → 피드백. 이 고리를 반복하며 코드가 읽히기 시작해요.</p>
        <ol className="mt-8 grid gap-3 sm:grid-cols-4">
          {FLOW.map((step, i) => (
            <li key={step.title} className="card relative p-5">
              <span className="absolute right-4 top-4 font-mono text-xs font-bold text-ink-300">0{i + 1}</span>
              <div className="text-2xl">{step.icon}</div>
              <p className="mt-3 font-bold">{step.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-3xl bg-white/60 p-6 ring-1 ring-ink-200/70">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-xl">{f.icon}</div>
              <p className="mt-4 text-[17px] font-bold">{f.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* One code, many questions */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <div className="card grid items-center gap-8 p-6 sm:p-8 md:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">코드 하나, 질문 여러 개</h2>
            <p className="mt-3 leading-relaxed text-ink-500">
              같은 코드를 여러 관점에서 다시 읽을 때 진짜 이해가 생겨요. 결과를 예측하고, 빠진 부분을 채우고, 순서를 맞추고, 일부러 넣은 오류를 찾고, 마지막엔 내 말로 설명해요.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {ONE_CODE_MANY.map((t) => (
                <span key={t} className="chip bg-brand-50 px-3 py-1.5 text-sm text-brand-700">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <CodeBlock code={ADULTS_CODE} focusLines={[7]} />
        </div>
      </section>

      {/* Levels */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">기억하기에서 종합하기까지, 5단계</h2>
        <p className="mt-2 text-ink-500">난이도가 올라갈수록 문법 암기에서 분석과 추론 중심으로 바뀌어요.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-5">
          {LEVELS.map((l) => (
            <div key={l.level} className="card p-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">{l.emoji}</span>
                <span className="font-mono text-xs font-bold text-ink-400">LEVEL {l.level}</span>
              </div>
              <p className="mt-2 font-bold">{l.name}</p>
              <p className="text-sm font-semibold text-brand-600">{l.skillLabel}</p>
              <p className="mt-1 text-sm text-ink-500">{l.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-4 pb-24 pt-8">
        <div className="rounded-3xl bg-brand-600 px-6 py-12 text-center text-white shadow-lift sm:px-12">
          <p className="text-2xl font-extrabold sm:text-3xl">어렵게 공부하는 코딩이 아니라,</p>
          <p className="mt-1 text-2xl font-extrabold text-brand-100 sm:text-3xl">매일 하나씩 이해하는 코딩.</p>
          <Link href="/learn" className="btn mt-8 bg-white px-7 py-3.5 text-base text-brand-700 hover:bg-brand-50">
            오늘의 첫 문제 풀어보기
          </Link>
        </div>
        <p className="mt-6 text-center text-xs text-ink-400">
          코드를 대신 작성해주는 AI가 아니라, 코드를 스스로 읽고 이해할 수 있도록 가르치는 AI.
        </p>
      </section>
    </div>
  );
}
