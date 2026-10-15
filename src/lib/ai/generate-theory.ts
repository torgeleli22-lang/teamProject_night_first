import crypto from "node:crypto";
import * as z from "zod/v4";
import { computeFactors } from "../content/analyzer";
import type { Trigger } from "../content/policy";
import { validateItem, type ValidationReport } from "../content/validate";
import { CERT_SUBJECTS, conceptsOf, getConcept, getUnit, levelInfo } from "../curriculum";
import { loadContent, saveGeneratedItem } from "../server/content-repo";
import { finishJob } from "../server/ops-repo";
import type { ConceptId, Level, MultipleChoiceQuestion } from "../types";
import { askStructured } from "./client";
import { beginJob, type GenerateResult } from "./generate";

/**
 * 개념 문제(네트워크·개발·운영·보안) AI 생성.
 * 실행으로 정답을 확인할 수 없으므로 세 겹으로 확인한다.
 *   ① AI 가 문제를 만든다 (smart) → ② 규칙 검사 (보기 4개·중복·정답 번호·자격증 태그)
 *   → ③ 다른 AI 호출이 정답을 모르는 채로 문제를 풀어 본다 (fast). 고른 답이 다르거나 문제가 있다고 하면 그 문제는 뺀다
 *   → 남은 문제를 '승인 대기(pending)'로 저장 → ④ 관리자가 보고 승인해야 학습자에게 나간다.
 */

const SKILLS = ["recall", "predict", "analyze", "infer", "synthesize"] as const;
const certIds = CERT_SUBJECTS.map((c) => c.id) as [string, ...string[]];

/** 한 번에 만드는 문제 수와, 교차 풀이 뒤 최소한 남아야 하는 수 */
const QUESTIONS_PER_SET = 5;
const MIN_KEPT = 3;

const TheoryQuestionSchema = z.object({
  skill: z.enum(SKILLS),
  prompt: z.string().describe("문제 문장. '~은 무엇일까요?' 처럼 한국어 존댓말"),
  choices: z
    .array(z.object({ text: z.string(), misconception: z.string().nullable().describe("이 오답을 고르는 사람의 오개념. 정답 보기는 null") }))
    .describe("보기 정확히 4개. 정답은 하나"),
  answerIndex: z.number().int().describe("정답 보기 번호 (0부터)"),
  certs: z.array(z.enum(certIds)).describe("관련 자격증 과목 id 1~2개 (주어진 목록에서만)"),
  hints: z.array(z.string()).describe("힌트 2개: 생각할 질문 → 핵심 짚기 (정답을 말하지 않음)"),
  explanation: z.string().describe("왜 정답이고 다른 보기는 왜 아닌지 2~4문장 (줄바꿈으로 단계 구분)"),
  keyPoint: z.string().describe("핵심 한 줄"),
});

const TheorySetSchema = z.object({ questions: z.array(TheoryQuestionSchema) });
type GeneratedTheory = z.infer<typeof TheoryQuestionSchema>;

const THEORY_SYSTEM = `당신은 IT 입문자를 위한 자격증 대비 문제를 만드는 출제 위원입니다. 분야는 네트워크·개발·운영 및 유지보수·보안입니다.

출제 규칙:
- 4지선다 객관식. 정답은 정확히 하나이고, 표준 교과서·국가기술자격 출제 기준에 맞는 사실만 씁니다. 버전·연도에 따라 바뀌는 사실, 출처가 불분명한 수치는 피합니다.
- "모두 고르시오", "위의 것 모두", "옳지 않은 것을 모두" 같은 형식과 말장난 문제는 만들지 않습니다. "틀린 것은?" 형식은 세트에 1개까지만.
- 오답 보기는 그럴듯해야 하고, 그 보기를 고르는 사람의 오개념(misconception)을 적습니다 (예: 'TCP 와 UDP 의 특징을 반대로 생각').
- 해설은 왜 정답인지와 헷갈리는 다른 보기가 왜 아닌지를 짧게 설명합니다.
- 힌트는 정답을 직접 말하지 않습니다.
- 한국어 존댓말("~해요"·"~일까요?"), 초보자가 이해할 수 있게 짧게. 영어 용어는 한글 설명과 함께.`;

const SolveSchema = z.object({
  answers: z.array(
    z.object({
      choice: z.number().int().describe("고른 보기 번호 (1부터)"),
      issue: z.string().nullable().describe("사실이 틀렸거나, 정답이 둘 이상이거나, 정답이 없다면 그 이유. 문제없으면 null"),
    }),
  ),
});

/** 정답을 모르는 채로 풀어 보기 (교차 검수). 문제마다 고른 번호(0부터)와 지적 사항 */
async function crossSolve(questions: GeneratedTheory[], signal?: AbortSignal): Promise<{ choice: number; issue: string | null }[]> {
  const r = await askStructured({
    signal,
    task: "content_review",
    tier: "fast",
    maxTokens: 3000,
    system: "당신은 IT 자격증 문제를 검토하는 꼼꼼한 검토자입니다. 각 문제를 직접 풀고, 사실 오류나 정답이 하나로 정해지지 않는 문제를 찾아냅니다.",
    schema: SolveSchema,
    // 목업: 마지막 문제는 일부러 다른 답을 골라, 교차 검수에서 빠지는 흐름을 확인할 수 있게 한다
    mock: () => ({
      answers: questions.map((q, i) =>
        i === questions.length - 1 && questions.length > MIN_KEPT
          ? { choice: ((q.answerIndex + 1) % 4) + 1, issue: "(목업) 정답이 하나로 정해지지 않아요" }
          : { choice: q.answerIndex + 1, issue: null },
      ),
    }),
    prompt: [
      "아래 문제들을 순서대로 직접 풀어서 정답 보기 번호를 고르세요. 정답이 명확하지 않거나 사실이 틀린 문제는 issue 에 이유를 적으세요.",
      questions.map((q, i) => `문제 ${i + 1}. ${q.prompt}\n${q.choices.map((c, k) => `  ${k + 1}) ${c.text}`).join("\n")}`).join("\n\n"),
    ].join("\n\n"),
  });
  return questions.map((_, i) => {
    const a = r.answers[i];
    return a ? { choice: a.choice - 1, issue: a.issue } : { choice: -1, issue: "교차 풀이 결과가 없어요" };
  });
}

/** 목업: 같은 분야의 다른 주제 핵심 문장을 오답으로 쓰는 문제 (형식은 실제와 같다) */
function mockTheory(concept: ConceptId, count: number): { questions: GeneratedTheory[] } {
  const c = getConcept(concept)!;
  const others = conceptsOf("theory").filter((o) => o.id !== concept && o.unitId === c.unitId);
  const pool = others.length >= 3 ? others : conceptsOf("theory").filter((o) => o.id !== concept);
  const questions: GeneratedTheory[] = [];
  for (let i = 0; i < count; i++) {
    const wrongs = [0, 1, 2].map((k) => pool[(i + k) % pool.length]);
    questions.push({
      skill: "recall",
      prompt: `(${i + 1}) 다음 중 '${c.name}'에 대한 설명으로 옳은 것은 무엇일까요?`,
      choices: [{ text: c.keyIdea, misconception: null }, ...wrongs.map((w) => ({ text: w.keyIdea, misconception: `${c.name}와(과) ${w.name}을(를) 혼동` }))],
      answerIndex: 0,
      certs: [CERT_SUBJECTS[0].id],
      hints: [`'${c.name}'이(가) 어떤 문제를 해결하려고 생겼는지 떠올려 보세요.`, "다른 보기는 같은 분야의 다른 개념 설명이에요."],
      explanation: `${c.summary}\n다른 보기는 ${wrongs.map((w) => w.name).join(", ")}에 대한 설명이에요.`,
      keyPoint: c.keyIdea,
    });
  }
  return { questions };
}

export async function generateTheorySet(opts: {
  concept: ConceptId;
  level: Level;
  trigger: Trigger;
  reason: string;
  sessionId?: string;
  instructions?: string;
  stopSince?: number;
}): Promise<GenerateResult> {
  const started = await beginJob(opts);
  if ("skipped" in started) return started.skipped;
  const { jobId, controller, cancelled, stopped, finish } = started;
  const concept = getConcept(opts.concept)!;
  const unit = getUnit(concept.unitId);
  const info = levelInfo(opts.level);

  try {
    // 이미 있는 문제와 겹치지 않게 지문을 알려 준다
    const { items, byItem } = await loadContent();
    const existing = [...items.values()]
      .filter((i) => i.concepts.includes(opts.concept))
      .flatMap((i) => (byItem.get(i.id) ?? []).map((q) => q.prompt))
      .slice(0, 30);
    let feedback = "";
    const notes: ValidationReport["checks"] = [];

    for (let round = 0; round < 2; round++) {
      if (await cancelled()) return stopped();
      const generated = await askStructured({
        signal: controller.signal,
        task: "content_generation",
        tier: "smart",
        effort: "high",
        maxTokens: 8000,
        system: THEORY_SYSTEM,
        schema: TheorySetSchema,
        mockDelayMs: 1200,
        mock: () => mockTheory(opts.concept, QUESTIONS_PER_SET),
        prompt: [
          `분야: ${unit?.title ?? ""} / 주제: ${concept.name} — ${concept.keyIdea}`,
          `주제 설명: ${concept.summary}`,
          `난이도: Level ${opts.level} ${info.name} (${info.theoryDescription}).`,
          `문제 수: ${QUESTIONS_PER_SET}개. 문제마다 skill 은 ${SKILLS.join(", ")} 중에서 난이도에 맞게.`,
          `자격증 과목 id (certs 에는 이 중에서만, 관련 있는 것 1~2개):\n${CERT_SUBJECTS.map((c) => `- ${c.id}: ${c.cert} ${c.name}`).join("\n")}`,
          existing.length ? `이미 있는 문제 (겹치지 않게 다른 내용으로):\n${existing.map((p) => `- ${p}`).join("\n")}` : "",
          opts.instructions
            ? `관리자가 원하는 내용입니다. 출제 규칙을 지키는 범위에서 반영하세요:\n<admin_request>\n${opts.instructions}\n</admin_request>`
            : "",
          feedback,
        ]
          .filter(Boolean)
          .join("\n\n"),
      });

      // ② 규칙 검사 + ③ 교차 풀이
      if (await cancelled()) return stopped();
      const solved = await crossSolve(generated.questions, controller.signal);
      const itemId = `ai-${opts.concept}-${crypto.randomUUID().slice(0, 8)}`;
      const kept: MultipleChoiceQuestion[] = [];
      const checks: ValidationReport["checks"] = [...notes];
      generated.questions.forEach((g, n) => {
        const tag = `[${n + 1}번 문제]`;
        const texts = g.choices.map((c) => c.text.trim());
        const shapeOk = g.choices.length === 4 && new Set(texts).size === 4 && g.answerIndex >= 0 && g.answerIndex < 4 && !g.choices[g.answerIndex].misconception;
        const s = solved[n];
        const agree = s.choice === g.answerIndex && !s.issue;
        checks.push({ name: `${tag} 보기 4개·중복 없음·정답 번호`, pass: shapeOk });
        checks.push({
          name: `${tag} AI 교차 풀이 (정답을 모르는 채로 풀어 같은 답)`,
          pass: agree,
          detail: agree ? undefined : s.issue ?? `교차 풀이는 ${s.choice + 1}번, 출제 정답은 ${g.answerIndex + 1}번`,
        });
        if (!shapeOk || !agree) return;
        kept.push({
          id: `${itemId}-q${n + 1}`,
          codeItemId: itemId,
          type: "multiple_choice",
          skill: g.skill,
          prompt: g.prompt,
          choices: g.choices.map((c) => ({ text: c.text, ...(c.misconception ? { misconception: c.misconception } : {}) })),
          answerIndex: g.answerIndex,
          certs: [...new Set(g.certs)].slice(0, 2),
          hints: g.hints.filter((h) => h.trim()).slice(0, 4),
          explanation: g.explanation,
          keyPoint: g.keyPoint,
        });
      });

      const structural = await validateItem({ code: "", concepts: [opts.concept], output: null, runnable: false, questions: kept });
      const report: ValidationReport = { ...structural, checks: [...checks, ...structural.checks] };
      const enough = kept.length >= MIN_KEPT && structural.ok;
      report.ok = enough;
      report.checks.push({ name: `교차 풀이를 통과한 문제 ${MIN_KEPT}개 이상`, pass: kept.length >= MIN_KEPT, detail: `${kept.length}/${generated.questions.length}개 통과` });

      if (!enough && round === 0) {
        notes.push({ name: "1차 생성물이 검수를 통과하지 못해 다시 만듦", pass: true, detail: `${kept.length}/${generated.questions.length}개 통과` });
        feedback = `이전에 만든 문제 중 다음 문제가 검수에서 빠졌습니다. 같은 실수를 하지 말고 새로 만드세요:\n${report.checks
          .filter((c) => !c.pass)
          .map((c) => `- ${c.name}${c.detail ? ` (${c.detail})` : ""}`)
          .join("\n")}`;
        continue;
      }
      if (await cancelled()) return stopped();
      const status = enough ? "pending" : "rejected";
      await saveGeneratedItem(
        {
          id: itemId,
          track: "theory",
          language: null,
          title: `${concept.name} (AI)`,
          code: "",
          concepts: [opts.concept],
          level: opts.level,
          factors: computeFactors("", 1),
          output: null,
          runnable: false,
          status,
        },
        kept,
        report,
        jobId,
      );
      const error = enough
        ? null
        : report.checks
            .filter((c) => !c.pass)
            .map((c) => `- ${c.name}${c.detail ? ` (${c.detail})` : ""}`)
            .join("\n");
      await finishJob(jobId, status, itemId, error);
      return { jobId, status, itemId, report };
    }
    throw new Error("unreachable");
  } catch (err) {
    if (await cancelled()) return stopped();
    const message = err instanceof Error ? err.message : String(err);
    await finishJob(jobId, "failed", null, message);
    return { jobId, status: "failed", error: message };
  } finally {
    finish();
  }
}
