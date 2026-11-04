import Link from "next/link";
import { CodeView } from "@/components/CodeView";
import { MarkText, Page, PenMark, Sticky } from "@/components/ui";

const HERO_CODE = `def sell(item, qty):
    status = check_stock(item)
    if status in ("품절",):
        return False
    inventory[item] -= qty`;

/** 01 · 첫 화면 */
export default function Home() {
  return (
    <Page className="mt-0">
      {/* 머리말 + 맛보기 코드 */}
      <section className="grid gap-10 md:grid-cols-[1fr_1.05fr] md:items-center">
        <div>
          <p className="hand text-pen-red">오늘의 공부: 코드 흐름 따라가기</p>
          <h1 className="mt-3 text-4xl leading-tight sm:text-5xl">
            AI가 짜 준 코드,
            <br />
            정말 <span className="marker">읽을 수</span> 있나요?
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-700">
            언어·난이도·주제를 고르면 AI 가 만들고 다른 AI 가 실행하듯 따라가며 확인한 코드를 드려요. 코드 옆에 메모로 흐름을 적으면 빨간펜으로 채점해 드려요.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/practice" className="btn-ink">
              연습 문제 받기
            </Link>
          </div>
        </div>
        <div className="relative md:pt-10">
          <Sticky tilt={2} className="z-10 mb-4 ml-auto w-60 p-3 md:absolute md:-top-1 md:right-0 md:mb-0" tape>
            <p className="hand text-pen-blue">2~4줄: 먼저 check_stock으로 상태를 보고, 품절이면 여기서 끝!</p>
          </Sticky>
          <CodeView code={HERO_CODE} highlights={[{ start: 2, end: 4 }]} from={1} />
          <p className="mt-3 flex items-center gap-2">
            <PenMark kind="partial" size={30} />
            <span className="hand text-pen-red">끝나면서 무엇을 돌려주는지도 적어 볼까요?</span>
          </p>
        </div>
      </section>

      {/* 공부하는 순서 */}
      <section className="mt-14">
        <h2 className="text-2xl">공부하는 순서</h2>
        <ol className="mt-4 space-y-2 text-sm">
          {[
            ["코드를 받는다", "언어·난이도(초급·중급·고급)·주제(랜덤 또는 직접)를 골라요."],
            ["형광펜으로 범위를 긋고 흐름을 메모한다", "※ 표시된 곳은 꼭 설명해요."],
            ["빨간펜 채점을 받는다", "흐름을 이해했는지 메모마다 ○ △ ✕ 로 채점하고 다시 볼 곳을 알려줘요."], // ○△✕ 는 아래 MarkText 가 빨간펜으로 그림
          ].map(([head, rest], i) => (
            <li key={head} className="flex gap-3">
              <span className="hand w-5 text-pen-red">{i + 1}.</span>
              <span>
                <b>{head}</b>{" "}
                <span className="text-ink-500">
                  · <MarkText text={rest} />
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </Page>
  );
}
