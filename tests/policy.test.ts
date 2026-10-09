import assert from "node:assert/strict";
import { test } from "node:test";
import { decideOnSession, decidePersonal, generatableLevels, launchFillPlan, POLICY } from "../src/lib/content/policy";

const base = { concept: "map", level: 3 as const };

test("재고가 최소치 미만이면 바로 생성 (재고 하한)", () => {
  const d = decideOnSession({ ...base, stock: POLICY.minStock - 1, unsolved: 10, demand: 0 });
  assert.equal(d.generate, true);
  assert.equal(d.generate && d.trigger, "stock_floor");
});

test("재고가 충분하고 안 푼 문제도 충분하면 생성하지 않음 (난이도·유형을 바꿨다는 이유만으로는 생성 X)", () => {
  assert.equal(decideOnSession({ ...base, stock: 20, unsolved: 10, demand: 5 }).generate, false);
});

test("한 학습자만 소진하면 생성하지 않고 수요만 기록 → 기존 문제 재출제", () => {
  const d = decideOnSession({ ...base, stock: 20, unsolved: 1, demand: 1 });
  assert.equal(d.generate, false);
  assert.equal(!d.generate && d.recordDemand, true);
});

test("여러 학습자가 소진하면 생성 (수요)", () => {
  const d = decideOnSession({ ...base, stock: 20, unsolved: 1, demand: POLICY.demandLearners });
  assert.equal(d.generate && d.trigger, "demand");
});

test("최대 재고에 도달하면 수요가 있어도 생성하지 않음", () => {
  assert.equal(decideOnSession({ ...base, stock: POLICY.maxStock, unsolved: 0, demand: 10 }).generate, false);
});

test("생성 대상이 아닌 칸 (DOM, fetch, 범위 밖 난이도)은 생성하지 않음", () => {
  assert.deepEqual(generatableLevels("dom"), []);
  assert.deepEqual(generatableLevels("fetch"), []);
  assert.equal(decideOnSession({ concept: "variables", level: 5, stock: 0, unsolved: 0, demand: 9 }).generate, false);
});

test("맞춤 복습은 학습자당 하루 한도", () => {
  assert.equal(decidePersonal({ ...base, stock: 10, unsolved: 2, personalToday: 0 }).generate, true);
  assert.equal(decidePersonal({ ...base, stock: 10, unsolved: 2, personalToday: POLICY.personalPerLearnerPerDay }).generate, false);
  assert.equal(decidePersonal({ ...base, stock: 10, unsolved: 50, personalToday: 0 }).generate, false, "복습할 문제가 충분하면 생성 X");
});

test("출시 전 채우기 계획: 생성 대상 칸 중 부족한 칸만, 필요한 세트 수", () => {
  const plan = launchFillPlan((c, l) => (c === "map" && l === 3 ? 0 : 99), ["map", "dom"]);
  assert.deepEqual(plan, [{ concept: "map", level: 3, stock: 0, sets: 2 }]);
});
