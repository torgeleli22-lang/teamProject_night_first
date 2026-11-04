import { Suspense } from "react";
import { ResultNote } from "./ResultNote";

export const metadata = { title: "빨간펜 채점 — 코드 리딩 노트" };

export default function ResultPage() {
  return (
    <Suspense fallback={null}>
      <ResultNote />
    </Suspense>
  );
}
