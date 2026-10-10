const squash = (s: string) => s.replace(/\s+/g, "");

/** 공백 차이를 무시하고 code 안에서 fragment 의 [시작, 끝) 위치를 찾는다 */
export function locate(code: string, fragment: string): [number, number] | null {
  const target = squash(fragment);
  if (!target) return null;
  for (let start = 0; start < code.length; start++) {
    if (/\s/.test(code[start])) continue;
    let i = start;
    let j = 0;
    while (i < code.length && j < target.length) {
      if (/\s/.test(code[i])) {
        i++;
        continue;
      }
      if (code[i] !== target[j]) break;
      i++;
      j++;
    }
    if (j === target.length) return [start, i];
  }
  return null;
}

/** 원본 코드에서 정답 부분을 빈칸 버전으로 바꿔 끼운 '화면용 코드'. 찾지 못하면 빈칸 코드만 */
export function blankedDisplay(code: string, blankedCode: string, answer: string): string {
  const pos = locate(code, blankedCode.replace("____", answer));
  return pos ? code.slice(0, pos[0]) + blankedCode + code.slice(pos[1]) : blankedCode;
}

/** 문제 id 로 시드를 만든 결정적 순열 (원래 순서와 같으면 한 칸 회전). 서버/클라이언트가 같은 결과를 얻는다 */
export function seededPermutation(n: number, seed: string): number[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return n > 1 && arr.every((v, i) => v === i) ? [...arr.slice(1), arr[0]] : arr;
}
