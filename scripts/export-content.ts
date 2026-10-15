/**
 * 문제 데이터 내보내기:  npm run export:content  →  lambda/load-content/content.json
 *
 * 화면과 같은 커리큘럼(src/lib/curriculum.ts)과 시드 문제(src/lib/content/seed)를 JSON 파일 하나로 만든다.
 * load-content Lambda 가 이 파일을 읽어 DynamoDB 에 넣고, 다른 Lambda 들은 DynamoDB 에서 읽는다.
 *
 *   npm run export:content -- --check   파일이 최신인지 확인만 (CI·verify 에서 사용)
 */
import fs from "node:fs";
import path from "node:path";
import { buildSeed } from "../src/lib/content/seed";
import { CERT_SUBJECTS, CONCEPTS, LEVELS, QUESTION_TYPE_LABEL, SKILL_LABEL, STAGE_INFO, UNITS } from "../src/lib/curriculum";

const OUT = path.resolve("lambda/load-content/content.json");

const { items, questions } = buildSeed(0);
const content = {
  format: "codereading-content/1",
  note: "자동으로 만든 파일이에요. 고칠 때는 src/lib/curriculum.ts·src/lib/content/seed 를 고치고 npm run export:content 를 실행하세요.",
  curriculum: {
    units: UNITS,
    concepts: CONCEPTS,
    levels: LEVELS,
    certSubjects: CERT_SUBJECTS,
    stages: STAGE_INFO,
    questionTypes: QUESTION_TYPE_LABEL,
    skills: SKILL_LABEL,
  },
  seed: items.map((item) => ({ item, questions: questions.filter((q) => q.codeItemId === item.id) })),
};
const text = JSON.stringify(content, null, 1) + "\n";

if (process.argv.includes("--check")) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== text) {
    console.error("✗ lambda/load-content/content.json 이 최신이 아니에요. npm run export:content 를 실행해 주세요.");
    process.exit(1);
  }
  console.log("✓ lambda/load-content/content.json 이 최신이에요.");
} else {
  fs.writeFileSync(OUT, text);
  console.log(`✓ ${path.relative(process.cwd(), OUT)} (코드·문제 묶음 ${items.length}개, 문제 ${questions.length}개, ${(text.length / 1024).toFixed(0)} KB)`);
}
