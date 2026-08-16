export const sourceStats = [
  { label: "People", value: "399", detail: "Cleaned partner records" },
  { label: "Projects", value: "146", detail: "Deal list preview rows" },
  { label: "Actions", value: "157", detail: "To Go operational rows" },
  { label: "Sources", value: "4", detail: "Workbooks under control" },
];

export const documentGaps = [
  { subject: "장용혁", type: "NDA / Profile", owner: "김수민", status: "Needed", due: "Review" },
  { subject: "서기석", type: "NDA", owner: "Unassigned", status: "Needed", due: "Review" },
  { subject: "Vendor advisors", type: "MOU", owner: "Operations", status: "Mixed", due: "This month" },
  { subject: "Partner appointments", type: "Appointment", owner: "Admin", status: "Needs audit", due: "This week" },
];

export const activeProjects = [
  { company: "캐치웰", type: "Re-engineering", pl: "김수민", pm: "한재연", next: "3단계 제안 / 전략 정리" },
  { company: "오콘", type: "Business / IR", pl: "김수민", pm: "Review", next: "대표 미팅 이후 일정 확정" },
  { company: "서울언니들", type: "Go Global", pl: "김수민", pm: "F&B", next: "태국 소싱 / 지분 조건 확인" },
  { company: "울타리몰", type: "Go Global", pl: "이정택", pm: "Review", next: "미국 확장 조건 정리" },
];

export const networkRows = [
  { name: "Anton Scholz", segment: "Vendor advisor", company: "Korea-Consult", role: "General Manager", docs: "NDA needed" },
  { name: "김수민", segment: "XP internal", company: "XYZ Plus", role: "DMC / Admin", docs: "Account active" },
  { name: "정홍재", segment: "Consulting partner", company: "XYZ Plus", role: "PL / F&B", docs: "Profile review" },
  { name: "조용구", segment: "LP / Finance", company: "PWC", role: "Finance", docs: "Review source" },
  { name: "강민준", segment: "External expert", company: "차병원", role: "Bio / Health", docs: "No requirement yet" },
];

export const eventRows = [
  { event: "IR Day", owner: "윤권상", invitees: "David Moon, 플링캐스트, 닥터프레소", state: "Date hold", next: "11일 or 12일 확정" },
  { event: "9월 유럽 출장", owner: "윤권상", invitees: "출장 참석자", state: "Planning", next: "여권 정보 / 입출국 일정" },
  { event: "Partner meeting", owner: "김수민", invitees: "신규 파트너", state: "Scheduling", next: "면담 일정과 참관 시작" },
];

export const taskRows = [
  { title: "9월 유럽 출장 일정 확정", owner: "윤권상", link: "Event", status: "Waiting" },
  { title: "엔젤투자조합 주간 점검", owner: "김수민", link: "Project", status: "In progress" },
  { title: "대명건설 패널 미팅 제안", owner: "김수민", link: "Project", status: "Backlog" },
  { title: "신규 파트너 NDA / Profile 확보", owner: "Operations", link: "Documents", status: "Backlog" },
];

