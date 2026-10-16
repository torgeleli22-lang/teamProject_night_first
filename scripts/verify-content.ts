/**
 * 시드 콘텐츠 검증: AI 생성 콘텐츠와 같은 검증기(lambda/generate-code/checks.mjs)로 모든 콘텐츠를 검사한다.
 * - 코드 학습: 코드를 격리된 환경에서 실제로 실행해 제시한 결과와 비교, 빈칸 정답 유일성, 모범 답안이 채점 기준을 통과하는지,
 *   읽기 단계(훑어보기·핵심 줄·정리)가 모두 있는지
 * - 개념 학습: 객관식 보기 4개·정답 번호·중복 보기, 자격증 과목 태그가 올바른지, 주제마다 문제가 있는지
 *
 * - lambda/api/content.json 이 지금 시드·커리큘럼과 같은지 (npm run export:content 를 잊지 않도록)
 *
 * 실행: npm run verify
 */
import { execFileSync } from "node:child_process";
import { validateItem } from "../lambda/generate-code/checks.mjs";
import { ALL_SEED_SETS, seedLevel } from "../src/lib/content/seed";
import { CERT_SUBJECTS, CONCEPTS, conceptsOf } from "../src/lib/curriculum";

const CONCEPT_IDS = CONCEPTS.map((c) => c.id);

async function main() {
  const failures: string[] = [];
  const ids = new Set<string>();
  let questions = 0;
  const levels: Record<number, number> = {};

  for (const set of ALL_SEED_SETS) {
    for (const q of set.questions) {
      if (ids.has(q.id)) failures.push(`[${set.id}] 중복 문제 id ${q.id}`);
      ids.add(q.id);
    }
    questions += set.questions.length;
    const level = seedLevel(set);
    levels[level] = (levels[level] ?? 0) + set.questions.length;
    const report = await validateItem({
      code: set.code,
      concepts: set.concepts,
      output: set.output,
      runnable: set.runnable !== false,
      questions: set.questions,
    }, CONCEPT_IDS);
    for (const c of report.checks.filter((c) => !c.pass)) failures.push(`[${set.id}] ${c.name}${c.detail ? `\n    ${c.detail}` : ""}`);

    if (set.track === "code") {
      for (const q of set.questions) if (!q.stage) failures.push(`[${set.id}] ${q.id} 에 읽기 단계(stage)가 없습니다`);
      for (const st of ["overview", "trace", "key", "wrapup"] as const) {
        if (!set.questions.some((q) => q.stage === st)) failures.push(`[${set.id}] 읽기 단계 ${st} 문제가 없습니다`);
      }
    } else {
      if (set.code) failures.push(`[${set.id}] 개념 학습에는 코드가 없어야 합니다`);
      for (const q of set.questions) {
        if (q.type !== "multiple_choice") failures.push(`[${set.id}] ${q.id} 개념 학습은 객관식만 씁니다`);
        else if (q.choices.length !== 4) failures.push(`[${set.id}] ${q.id} 보기는 4개여야 합니다`);
        if (!q.certs?.length) failures.push(`[${set.id}] ${q.id} 에 자격증 과목 태그가 없습니다`);
        for (const c of q.certs ?? []) if (!CERT_SUBJECTS.some((s) => s.id === c)) failures.push(`[${set.id}] ${q.id} 알 수 없는 자격증 과목 ${c}`);
      }
    }
  }

  // 개념 학습은 모든 주제에 문제가 있어야 한다. 코드 학습은 비어 있는 개념을 알려만 준다 (AI 생성으로 채움)
  const covered = new Set(ALL_SEED_SETS.flatMap((s) => s.concepts));
  conceptsOf("theory").forEach((c) => covered.has(c.id) || failures.push(`[주제 ${c.id}] 문제가 없습니다`));
  const emptyCode = conceptsOf("code").filter((c) => !covered.has(c.id));

  // lambda/api/content.json 이 최신인지
  try {
    execFileSync(process.execPath, ["--import", "tsx", "scripts/export-content.ts", "--check"], { stdio: "pipe" });
  } catch {
    failures.push("lambda/api/content.json 이 최신이 아니에요. npm run export:content 를 실행해 주세요.");
  }

  if (failures.length) {
    console.error(failures.join("\n"));
    console.error(`\n✗ ${failures.length}개 문제 발견`);
    process.exit(1);
  }
  const codeSets = ALL_SEED_SETS.filter((s) => s.track === "code");
  const theorySets = ALL_SEED_SETS.filter((s) => s.track === "theory");
  console.log(
    `✓ 코드 학습 ${codeSets.length}개(문제 ${codeSets.reduce((n, s) => n + s.questions.length, 0)}개) · 개념 주제 ${theorySets.length}개(문제 ${theorySets.reduce((n, s) => n + s.questions.length, 0)}개) 검증 완료`,
  );
  if (emptyCode.length) console.log(`  아직 코드 학습 시드가 없는 개념 ${emptyCode.length}개 (AI 생성 대상): ${emptyCode.map((c) => c.name).join(", ")}`);
  console.log(`  난이도별 문제 수: ${Object.entries(levels).map(([l, n]) => `Lv.${l} ${n}`).join(" · ")}`);
}

main();
