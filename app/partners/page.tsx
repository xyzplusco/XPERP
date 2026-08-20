import Link from "next/link";
import { BulkTable, type BulkRow, type ColumnDef } from "@/components/BulkTable";
import { SaveNotice } from "@/components/SaveNotice";
import { getPartners } from "@/lib/queries";
import { label, PARTNER_CLASS_OPTIONS, partnerClass } from "@/lib/labels";

export const dynamic = "force-dynamic";

const CLASS_FILTERS = ["임원", "직원", "파트너", "파트너 후보", "협력사", "외부 전문가", "미분류"];

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

function docState(value: string | null | undefined) {
  if (value === "O" || value === "Y") return "완료";
  if (value === "X") return "미비";
  if (!value || value === "Unknown") return "미확인";
  return value;
}

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; saved?: string; trashed?: string; error?: string }>;
}) {
  const { class: classFilter, saved, trashed, error } = await searchParams;
  const partners = await getPartners();

  const withClass = partners.map((person) => ({
    ...person,
    className: partnerClass(person.profile?.partner_status, person.profile?.network_segment),
  }));
  const filtered = classFilter ? withClass.filter((p) => p.className === classFilter) : withClass;

  const classOptions: [string, string][] = PARTNER_CLASS_OPTIONS.map((v) => [v, v]);

  const columns: ColumnDef[] = [
    { key: "name_ko", header: "이름", width: "12%", kind: "text" },
    { key: "partner_status", header: "구분", width: "11%", kind: "select", options: classOptions },
    { key: "company", header: "소속", width: "14%", kind: "readonly" },
    { key: "title", header: "직함", width: "11%", kind: "text" },
    { key: "email", header: "이메일", width: "18%", kind: "text" },
    { key: "phone", header: "연락처", width: "11%", kind: "text" },
    { key: "nda_status", header: "NDA", width: "7%", kind: "select", options: DOC_STATE_OPTIONS },
    { key: "profile_status", header: "프로필", width: "7%", kind: "select", options: DOC_STATE_OPTIONS },
    { key: "appointment_status", header: "위촉", width: "7%", kind: "select", options: DOC_STATE_OPTIONS },
  ];

  const rows: BulkRow[] = filtered.map((person) => ({
    id: person.id,
    href: `/partners/${person.id}`,
    linkKey: "name_ko",
    display: {
      name_ko: person.name_ko,
      partner_status: person.className,
      company: person.company?.name_ko ?? "",
      title: person.title ?? person.profile?.xp_role ?? "",
      email: person.email ?? "",
      phone: person.phone ?? "",
      nda_status: docState(person.profile?.nda_status),
      profile_status: docState(person.profile?.profile_status),
      appointment_status: docState(person.profile?.appointment_status),
    },
    raw: {
      name_ko: person.name_ko,
      partner_status: PARTNER_CLASS_OPTIONS.includes(
        person.profile?.partner_status as (typeof PARTNER_CLASS_OPTIONS)[number]
      )
        ? (person.profile?.partner_status as string)
        : "",
      title: person.title ?? "",
      email: person.email ?? "",
      phone: person.phone ?? "",
      nda_status: person.profile?.nda_status ?? "Unknown",
      profile_status: person.profile?.profile_status ?? "Unknown",
      appointment_status: person.profile?.appointment_status ?? "Unknown",
    },
  }));

  return (
    <>
      <div className="pageHeader">
        <h1>파트너</h1>
        <div className="pageHeaderMeta">
          {classFilter ? `${classFilter} ${filtered.length}명 / 전체 ${withClass.length}명` : `${withClass.length}명`}
          {" · 셀을 더블클릭하면 바로 수정"}
        </div>
      </div>

      <SaveNotice saved={saved ?? trashed} error={error} />

      <div className="filterBar">
        <Link href="/partners" className="smallButton navItemActive">
          전체 명부
        </Link>
        <Link href="/partners/board" className="smallButton">
          관리 보드
        </Link>
      </div>

      <div className="tabRow">
        <Link href="/partners" className={classFilter ? "tab" : "tab tabOn"}>
          전체<span className="tabCount">{withClass.length}</span>
        </Link>
        {CLASS_FILTERS.map((option) => (
          <Link
            key={option}
            href={`/partners?class=${encodeURIComponent(option)}`}
            className={classFilter === option ? "tab tabOn" : "tab"}
          >
            {option}
            <span className="tabCount">{withClass.filter((p) => p.className === option).length}</span>
          </Link>
        ))}
      </div>

      <div className="panel">
        <BulkTable
          entity="people"
          columns={columns}
          rows={rows}
          returnPath={classFilter ? `/partners?class=${encodeURIComponent(classFilter)}` : "/partners"}
          bulkActions={[
            { field: "partner_status", label: "구분 변경", options: classOptions },
            { field: "network_segment", label: "네트워크 분류", options: SEGMENT_OPTIONS },
            { field: "nda_status", label: "NDA 상태", options: DOC_STATE_OPTIONS },
          ]}
          emptyText="표시할 파트너가 없습니다."
        />
      </div>
    </>
  );
}
