import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* 1. 히어로 섹션 (Hero Banner) */}
      <section className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white py-20 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="max-w-xl">
            <span className="bg-indigo-600 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
              실무형 인프라 & 트러블슈팅 플랫폼
            </span>
            <h1 className="text-4xl md:text-5xl font-extrabold mt-4 leading-tight">
              이론부터 장애 해결까지,<br />엔지니어링 실전 역량 강화
            </h1>
            <p className="text-gray-300 mt-4 text-lg">
              네트워크 오류 수정, CI/CD 파이프라인 설정, 빈칸 코드 완성 등 실제 현업에서 마주하는 시나리오를 직접 해결해 보세요.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/practice"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-3 rounded-lg shadow-lg transition"
              >
                실전 챌린지 시작하기 💻
              </Link>
              <Link
                href="/concepts"
                className="bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium px-6 py-3 rounded-lg border border-gray-700 transition"
              >
                핵심 개념 공부하기 📚
              </Link>
            </div>
          </div>
          
          {/* 우측 시각적 터미널/에디터 목업 카드 */}
          <div className="w-full md:w-1/2 bg-gray-950 p-6 rounded-xl border border-gray-800 shadow-2xl font-mono text-sm">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-800">
              <span className="w-3 h-3 bg-red-500 rounded-full inline-block"></span>
              <span className="w-3 h-3 bg-yellow-500 rounded-full inline-block"></span>
              <span className="w-3 h-3 bg-green-500 rounded-full inline-block"></span>
              <span className="text-gray-500 text-xs ml-2">troubleshooting-terminal ~ bash</span>
            </div>
            <p className="text-red-400">$ [ERROR] 502 Bad Gateway detected on Nginx upstream.</p>
            <p className="text-yellow-300 mt-2">&gt; Task: Fix upstream port in nginx.conf</p>
            <p className="text-green-400 mt-2">✔ Status: Ready for user challenge [Lv.3]</p>
          </div>
        </div>
      </section>

      {/* 2. 핵심 투 트랙 안내 섹션 */}
      <section className="max-w-6xl mx-auto py-16 px-6">
        <div className="grid md:grid-cols-2 gap-8">
          {/* 실전 문제 챌린지 카드 */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold text-xl mb-6">
              💻
            </div>
            <h3 className="text-2xl font-bold text-gray-900">실전 트러블슈팅 챌린지</h3>
            <p className="text-gray-600 mt-3 leading-relaxed">
              AWS EC2 설정 오류, MySQL 슬로우 쿼리 튜닝, GitHub Actions 빌드 실패 등 현업 밀착형 문제의 빈칸을 채우고 시뮬레이션을 통과하세요.
            </p>
            <Link
              href="/practice"
              className="inline-block mt-6 text-indigo-600 font-semibold hover:text-indigo-800 transition"
            >
              챌린지 목록 보기 &rarr;
            </Link>
          </div>

          {/* 공부하기 (개념 학습) 카드 */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold text-xl mb-6">
              📚
            </div>
            <h3 className="text-2xl font-bold text-gray-900">핵심 기술 공부하기</h3>
            <p className="text-gray-600 mt-3 leading-relaxed">
              네트워크 프로토콜, 데이터베이스 인덱싱, 스프링 부트 구조 등 실전 문제 풀이에 꼭 필요한 탄탄한 이론 베이스를 학습하세요.
            </p>
            <Link
              href="/concepts"
              className="inline-block mt-6 text-emerald-600 font-semibold hover:text-emerald-800 transition"
            >
              학습 노트 보기 &rarr;
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
