import { Suspense } from "react";
import { PracticeSession } from "./PracticeSession";

export const metadata = { title: "문제 풀기 — 코드리딩" };

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-10" />}>
      <PracticeSession />
    </Suspense>
  );
}
