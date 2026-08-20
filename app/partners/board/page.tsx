import Link from "next/link";
import { BulkTable, type BulkRow, type ColumnDef } from "@/components/BulkTable";
import { SaveNotice } from "@/components/SaveNotice";
import { getPartnerBoard, type PartnerBoardRow } from "@/lib/queries";
import { getSessionUser, isOwner } from "@/lib/auth";
import { PARTNER_CLASS_OPTIONS, partnerClass } from "@/lib/labels";
import { daysSince } from "@/lib/week";

export const dynamic = "force-dynamic";

const DOC_STATE_OPTIONS: [string, string][] = [
  ["O", "완료"],
  ["X", "미비"],
  ["Unknown", "미확인"],
];

const SEGMENT_OPTIONS: [string, string][] = [
  ["xp_internal", "XP 내부"],
  ["consulting_partner", "컨설팅 파트너"],
  ["investment_finance_partner", "투자/재무 파트너"],
  ["lp_investor", "LP/투자자"],
  ["external_expert", "외부 전문가"],
  ["vendor_advisor", "협력사"],
  ["customer_contact", "고객사 담당자"],
  ["event_invitee", "행사 참석자"],
  ["unknown", "미분류"],
];

const DONE = new Set(["O", "Y", "완료"]);

function docState(value: string | null | undefined) {
  if (DONE.has(value ?? "")) return "완료";
  if (value === "X") return "미비";
  // 임포트 과정에서 엉뚱한 값이 들어간 칸이 있다. 그대로 보여주지 않고 미확인으로 처리한다.
  return "미확인";
}

// XP 내부 인력은 파트너 NDA 대상이 아니므로 제외한다.
function isInternal(row: PartnerBoardRow) {
  return row.partner_status === "임원" || row.partner_status === "직원" || row.network_segment === "xp_internal";
}

function ndaMissing(row: PartnerBoardRow) {
  return !isInternal(row) && !DONE.has(row.nda_status ?? "");
}

const VIEWS = ["all", "project", "document", "unlabeled", "nda"] as const;
type View = (typeof VIEWS)[number];

export default async function PartnerBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; saved?: string; trashed?: string; error?: string }>;
}) {
  const { view: viewParam, saved, trashed, error } = await searchParams;
  const view: View = VIEWS.includes(viewParam as View) ? (viewParam as View) : "all";

  const [user, all] = await Promise.all([getSessionUser(), getPartnerBoard()]);

  const counts = {
    all: all.length,
    project: all.filter((r) => r.evidence.includes("project")).length,
    document: all.filter((r) => r.evidence.includes("document")).length,
    unlabeled: all.filter((r) => !r.evidence.includes("label")).length,
    nda: all.filter((r) => ndaMissing(r)).length,
  };

  const rowsData =
    view === "project" ? all.filter((r) => r.evidence.includes("project"))
    : view === "document" ? all.filter((r) => r.evidence.includes("document"))
    : view === "unlabeled" ? all.filter((r) => !r.evidence.includes("label"))
    : view === "nda" ? all.filter((r) => ndaMissing(r))
    : all;

  // 부하 경고: 프로젝트를 맡은 사람들의 평균 대비 2배를 넘으면 굵게.
  const carrying = all.filter((r) => r.projectCount > 0);
  const average = carrying.length
    ? carrying.reduce((sum, r) => sum + r.projectCount, 0) / carrying.length
    : 0;
  const heavy = average > 0 ? average * 2 : Infinity;

  const classOptions: [string, string][] = PARTNER_CLASS_OPTIONS.map((v) => [v, v]);

  const columns: ColumnDef[] = [
    { key: "name", header: "이름", width: 110, kind: "readonly" },
    { key: "partner_status", header: "구분", width: 110, kind: "select", options: classOptions },
    { key: "company", header: "소속", width: 150, kind: "readonly" },
    { key: "projects", header: "참여 프로젝트", width: 160, kind: "readonly" },
    { key: "roles", header: "역할", width: 90, kind: "readonly" },
    { key: "nda_status", header: "NDA", width: 80, kind: "select", options: DOC_STATE_OPTIONS },
    { key: "profile_status", header: "프로필", width: 80, kind: "select", options: DOC_STATE_OPTIONS },
    { key: "appointment_status", header: "위촉", width: 80, kind: "select", options: DOC_STATE_OPTIONS },
    { key: "last", header: "최근 활동", width: 120, kind: "readonly" },
  ];

  const rows: BulkRow[] = rowsData.map((row) => {
    const detail = [
      row.contractCount > 0 ? `계약 ${row.contractCount}` : null,
      row.negotiationCount > 0 ? `협상 ${row.negotiationCount}` : null,
    ].filter(Boolean);

    return {
      id: row.id,
      href: `/partners/${row.id}`,
      linkKey: "name",
      emphasis: row.projectCount >= heavy ? ["projects"] : undefined,
      display: {
        name: row.name,
        partner_status: partnerClass(row.partner_status, row.network_segment),
        company: row.company ?? "",
        projects:
          row.projectCount === 0
            ? ""
            : `${row.projectCount}건${detail.length ? ` (${detail.join("·")})` : ""}`,
        roles: row.roles.join("·"),
        nda_status: docState(row.nda_status),
        profile_status: docState(row.profile_status),
        appointment_status: docState(row.appointment_status),
        last: (() => {
          if (!row.lastLabel) return "";
          const days = daysSince(row.lastDate);
          return days === null ? row.lastLabel : `${row.lastLabel} (${days}일)`;
        })(),
      },
      raw: {
        partner_status: PARTNER_CLASS_OPTIONS.includes(
          row.partner_status as (typeof PARTNER_CLASS_OPTIONS)[number]
        )
          ? (row.partner_status as string)
          : "",
        nda_status: row.nda_status ?? "Unknown",
        profile_status: row.profile_status ?? "Unknown",
        appointment_status: row.appointment_status ?? "Unknown",
      },
    };
  });

  const viewHref = (key: View) => (key === "all" ? "/partners/board" : `/partners/board?view=${key}`);

  return (
    <>
      <div className="pageHeader">
        <h1>파트너 관리 보드</h1>
        <div className="pageHeaderMeta">
          활동 파트너 {counts.all}명
        </div>
      </div>

      <SaveNotice saved={saved ?? trashed} error={error} />

      <div className="filterBar">
        <Link href="/partners" className="smallButton">
          전체 명부
        </Link>
        <Link href="/partners/board" className="smallButton navItemActive">
          관리 보드
        </Link>
      </div>

      <div className="summaryRow">
        <div className="summaryCell">
          <div className="summaryLabel">활동 파트너</div>
          <div className="summaryValue">{counts.all}</div>
        </div>
        <div className="summaryCell">
          <div className="summaryLabel">프로젝트 참여</div>
          <div className="summaryValue">{counts.project}</div>
        </div>
        <div className="summaryCell">
          <div className="summaryLabel">문서 보유</div>
          <div className="summaryValue">{counts.document}</div>
        </div>
        <div className="summaryCell">
          <div className="summaryLabel">구분 미지정</div>
          <div className="summaryValue">{counts.unlabeled}</div>
        </div>
        <div className="summaryCell">
          <div className="summaryLabel">NDA 미확보</div>
          <div className="summaryValue">{counts.nda}</div>
        </div>
      </div>

      <div className="tabRow">
        <Link href={viewHref("all")} className={view === "all" ? "tab tabOn" : "tab"}>
          전체<span className="tabCount">{counts.all}</span>
        </Link>
        <Link href={viewHref("project")} className={view === "project" ? "tab tabOn" : "tab"}>
          프로젝트 참여<span className="tabCount">{counts.project}</span>
        </Link>
        <Link href={viewHref("document")} className={view === "document" ? "tab tabOn" : "tab"}>
          문서 보유<span className="tabCount">{counts.document}</span>
        </Link>
        <Link href={viewHref("unlabeled")} className={view === "unlabeled" ? "tab tabOn" : "tab"}>
          구분 미지정<span className="tabCount">{counts.unlabeled}</span>
        </Link>
        <Link href={viewHref("nda")} className={view === "nda" ? "tab tabOn" : "tab"}>
          NDA 미확보<span className="tabCount">{counts.nda}</span>
        </Link>
      </div>

      <div className="panel">
        <BulkTable
          storageKey="partner-board"
          canPaste={isOwner(user)}
          entity="people"
          columns={columns}
          rows={rows}
          returnPath={viewHref(view)}
          bulkActions={[
            { field: "partner_status", label: "구분 변경", options: classOptions },
            { field: "network_segment", label: "네트워크 분류", options: SEGMENT_OPTIONS },
            { field: "nda_status", label: "NDA 상태", options: DOC_STATE_OPTIONS },
            { field: "profile_status", label: "프로필 상태", options: DOC_STATE_OPTIONS },
            { field: "appointment_status", label: "위촉 상태", options: DOC_STATE_OPTIONS },
          ]}
          emptyText="해당하는 파트너가 없습니다."
        />
      </div>
    </>
  );
}
