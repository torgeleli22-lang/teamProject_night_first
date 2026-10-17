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
            코드 옆에 메모로 흐름을 적어 보세요. 내가 어디까지 제대로 읽었는지, 빨간펜으로 메모마다 첨삭해 드려요.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/practice" className="btn-ink">
              연습 문제 받기
            </Link>
            <Link href="/check" className="btn-line">
              내 코드 가져오기
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

      {/* 두 가지 공부 */}
      <section className="mt-14">
        <h2 className="text-2xl">어떤 코드로 공부할까요?</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Sticky color="yellow" tape tilt={-0.6} className="p-6">
            <h3 className="text-lg">연습 모드</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">난이도와 주제를 정하면 읽기 연습용 코드를 받아요. 주제는 랜덤으로 뽑거나 직접 적을 수 있어요.</p>
            <p className="hand mt-2 text-pen-blue">너무 어려우면 &lsquo;더 쉽게&rsquo;로 다시 받기</p>
            <Link href="/practice" className="btn-ink mt-4">
              연습 시작
            </Link>
          </Sticky>
          <Sticky color="mint" tape tilt={0.5} className="p-6">
            <h3 className="text-lg">내 코드 점검</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-700">갖고 있는 코드를 붙여넣거나 파일로 올려요. 꼭 짚어야 할 곳을 표시해 줄 테니 메모로 설명해 보세요.</p>
            <p className="hand mt-2 text-pen-blue">API 키 같은 값은 올리기 전에 가려 줘요</p>
            <Link href="/check" className="btn-line mt-4">
              코드 가져오기
            </Link>
          </Sticky>
        </div>
      </section>

      {/* 공부하는 순서 */}
      <section className="mt-14">
        <h2 className="text-2xl">공부하는 순서</h2>
        <ol className="mt-4 space-y-2 text-sm">
          {[
            ["코드를 받는다", "연습 문제를 받거나 내 코드를 가져와요."],
            ["형광펜으로 범위를 긋고 메모한다", "※ 표시된 줄은 꼭 설명해요."],
            ["빨간펜 첨삭을 받는다", "메모마다 ○ △ ✕ 로 채점하고 다시 볼 곳을 알려줘요."], // ○△✕ 는 아래 MarkText 가 빨간펜으로 그림
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
