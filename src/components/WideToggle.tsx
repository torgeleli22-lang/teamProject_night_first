"use client";

import { useEffect, useState } from "react";

const KEY = "codereading.wide";

/**
 * 넓게 보기: 공책을 브라우저 너비만큼 넓혀서 늘어난 너비를 코드 칸에 준다 (오른쪽 메모·첨삭 칸과 기능은 그대로).
 * <html data-wide="1"> 일 때 globals.css 의 .note-wrap 이 최대 너비(1440px)를 풀어 준다.
 * 고른 값은 이 브라우저에 기억하고, 이 버튼이 있는 화면(읽기·첨삭)에서만 넓어진다.
 */
export function useWideLayout() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    try {
      setWide(localStorage.getItem(KEY) === "1");
    } catch {
      /* 기억하지 못해도 보통 너비로 */
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.wide = wide ? "1" : "";
    return () => {
      document.documentElement.dataset.wide = "";
    };
  }, [wide]);
  function toggle() {
    setWide((w) => {
      try {
        localStorage.setItem(KEY, w ? "0" : "1");
      } catch {
        /* 저장하지 못해도 지금 화면은 바뀜 */
      }
      return !w;
    });
  }
  return { wide, toggle };
}

export function WideToggle({ wide, onToggle }: { wide: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="btn-small hidden lg:inline-flex" aria-pressed={wide} onClick={onToggle} title="오른쪽 메모 칸은 그대로 두고 코드 칸을 넓혀요">
      {wide ? "보통 너비로" : "넓게 보기"}
    </button>
  );
}
