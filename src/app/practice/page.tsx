import { Suspense } from "react";
import { PracticeStart } from "./PracticeStart";

export const metadata = { title: "연습 모드 — 코드 리딩 노트" };

export default function PracticePage() {
  return (
    <Suspense fallback={null}>
      <PracticeStart />
    </Suspense>
  );
}
