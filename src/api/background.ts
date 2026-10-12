import { runLearnerAnalysis } from "../lib/ai/analysis";
import { generateCodeSet } from "../lib/ai/generate";
import { stopRequestedSince } from "../lib/server/ops-repo";
import type { Trigger } from "../lib/content/policy";
import type { ConceptId, Level } from "../lib/types";

/**
 * 응답 뒤에 할 일. Lambda 는 응답을 보내면 실행이 멈추므로,
 * 같은 함수를 '비동기 호출(Event)'로 한 번 더 불러서 이 작업만 따로 실행한다.
 * (로컬 개발 서버에서는 그냥 뒤에서 실행)
 */
export type BackgroundTask =
  | {
      kind: "generate";
      concept: ConceptId;
      level: Level;
      trigger: Trigger;
      reason: string;
      sessionId?: string;
      focus?: string[];
    }
  | { kind: "analysis"; sessionId: string; level: Level | null }
  | { kind: "fill"; cells: { concept: ConceptId; level: Level; stock: number }[] };

export async function runTask(task: BackgroundTask): Promise<void> {
  switch (task.kind) {
    case "generate": {
      const { kind: _, ...opts } = task;
      await generateCodeSet(opts);
      return;
    }
    case "analysis":
      await runLearnerAnalysis(task.sessionId, task.level);
      return;
    case "fill": {
      const startedAt = Date.now();
      for (const c of task.cells) {
        // 관리자가 '생성 중지'를 누르면 남은 칸은 만들지 않는다
        if (await stopRequestedSince(startedAt)) return;
        await generateCodeSet({ concept: c.concept, level: c.level, trigger: "launch_fill", reason: `출시 전 채우기: 공개 문제 ${c.stock}개`, stopSince: startedAt });
      }
      return;
    }
  }
}

export type BackgroundRunner = (task: BackgroundTask) => Promise<void>;

/** 로컬: 기다리지 않고 바로 뒤에서 실행 */
export const detachedRunner: BackgroundRunner = async (task) => {
  void runTask(task).catch((e) => console.error("[background]", task.kind, e));
};
