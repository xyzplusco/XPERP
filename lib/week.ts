// 주차 표기 — XP 내부 규칙
// 매월 1~7일=1차, 8~14일=2차, 15~21일=3차, 22일~말일=4차
// PL 주간업무보고와 동일한 기준을 쓴다.

export type Week = { label: string; date: string; month: number; nth: number };

const NTH_START = [1, 8, 15, 22];

export function weekOf(date: Date): Week {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const nth = day >= 22 ? 4 : day >= 15 ? 3 : day >= 8 ? 2 : 1;
  return {
    label: `${month}월${nth}차`,
    date: startDate(date.getFullYear(), month, nth),
    month,
    nth,
  };
}

function startDate(year: number, month: number, nth: number) {
  const day = NTH_START[nth - 1];
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function currentWeek(): Week {
  return weekOf(new Date());
}

// 최근 N개 주차를 최신순으로 (지난 주차 소급 작성용)
export function recentWeeks(count = 8, from = new Date()): Week[] {
  const out: Week[] = [];
  let month = from.getMonth() + 1;
  let year = from.getFullYear();
  let nth = weekOf(from).nth;

  for (let i = 0; i < count; i += 1) {
    out.push({ label: `${month}월${nth}차`, date: startDate(year, month, nth), month, nth });
    nth -= 1;
    if (nth < 1) {
      nth = 4;
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
    }
  }
  return out;
}

export function previousWeek(week: Week, from = new Date()): Week {
  const list = recentWeeks(2, from);
  const index = list.findIndex((w) => w.label === week.label);
  if (index >= 0 && list[index + 1]) return list[index + 1];
  let { month, nth } = week;
  nth -= 1;
  if (nth < 1) {
    nth = 4;
    month = month === 1 ? 12 : month - 1;
  }
  return { label: `${month}월${nth}차`, date: startDate(from.getFullYear(), month, nth), month, nth };
}

// '2026-08-19' 같은 날짜를 며칠 전인지로
export function daysSince(dateText: string | null | undefined): number | null {
  if (!dateText) return null;
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}
