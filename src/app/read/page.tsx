import { Suspense } from "react";
import { ReadNote } from "./ReadNote";

export const metadata = { title: "메모하며 읽기 — 코드 리딩 노트" };

export default function ReadPage() {
  return (
    <Suspense fallback={null}>
      <ReadNote />
    </Suspense>
  );
}
