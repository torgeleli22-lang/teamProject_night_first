/**
 * 시드 콘텐츠 검증: AI 생성 콘텐츠와 같은 검증기(validate.ts)로 모든 코드 세트를 검사한다.
 * - 코드를 격리된 환경에서 실제로 실행해 제시한 결과와 비교
 * - 객관식/빈칸 정답 유일성, 오류 찾기 코드가 실제로 다른 결과를 내는지, 모범 답안이 채점 기준을 통과하는지 등
 *
 * 실행: npm run verify
 */
import { validateItem } from "../src/lib/content/validate";
import { ALL_SEED_SETS, seedLevel } from "../src/lib/content/seed";
import { CONCEPTS } from "../src/lib/curriculum";

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
    });
    for (const c of report.checks.filter((c) => !c.pass)) failures.push(`[${set.id}] ${c.name}${c.detail ? `\n    ${c.detail}` : ""}`);
  }

  const covered = new Set(ALL_SEED_SETS.flatMap((s) => s.concepts));
  CONCEPTS.forEach((c) => covered.has(c.id) || failures.push(`[concept ${c.id}] 문제가 없습니다`));

  if (failures.length) {
    console.error(failures.join("\n"));
    console.error(`\n✗ ${failures.length}개 문제 발견`);
    process.exit(1);
  }
  console.log(`✓ 코드 ${ALL_SEED_SETS.length}개 · 문제 ${questions}개 검증 완료`);
  console.log(`  난이도별 문제 수: ${Object.entries(levels).map(([l, n]) => `Lv.${l} ${n}`).join(" · ")}`);
}

main();
