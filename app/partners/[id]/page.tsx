import Link from "next/link";
import { notFound } from "next/navigation";
import { DealTable } from "@/components/DealTable";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { SaveNotice } from "@/components/SaveNotice";
import { updatePartnerAction } from "@/lib/actions";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { getPartner } from "@/lib/queries";
import { formatDate, label, PARTNER_CLASS_OPTIONS, partnerClass } from "@/lib/labels";

export const dynamic = "force-dynamic";

const SEGMENT_OPTIONS = [
  "xp_internal",
  "consulting_partner",
  "investment_finance_partner",
  "lp_investor",
  "external_expert",
  "vendor_advisor",
  "customer_contact",
  "event_invitee",
  "unknown",
];

const DOC_STATE_OPTIONS = ["O", "X", "Unknown"];

function docState(value: string | null | undefined) {
  if (value === "O" || value === "Y") return "완료";
  if (value === "X") return "미비";
  if (!value || value === "Unknown") return "미확인";
  return value;
}

export default async function PartnerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const [user, data] = await Promise.all([getSessionUser(), getPartner(id)]);
  if (!data) notFound();

  const { person, projects, documentRequirements, companyLinks, documents } = data;
  const profile = person.profile as Record<string, string | null> | null;
  const admin = isAdmin(user);
  const updateAction = updatePartnerAction.bind(null, id);
  const className = partnerClass(profile?.partner_status, profile?.network_segment);

  return (
    <>
      <div className="detailHeader">
        <div className="detailKicker">
          <Link href="/partners">파트너</Link> / P-{id.replace(/-/g, "").slice(0, 8).toUpperCase()}
        </div>
        <div className="detailTitleRow">
          <h1>{String(person.name_ko ?? "")}</h1>
          <span className="detailBadge">{className}</span>
        </div>
        <div className="detailSub">
          {[person.title ?? profile?.xp_role, (person.company as { name_ko: string } | null)?.name_ko]
            .filter(Boolean)
            .join(" · ") || "소속 정보 없음"}
        </div>
      </div>

      <SaveNotice saved={saved} error={error} />

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">프로필</div>
        </div>
        <div className="panelBody">
          <div className="kvGrid">
            <div className="kvItem">
              <div className="kvLabel">이메일</div>
              <div className="kvValue">{String(person.email ?? "") || "–"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">연락처</div>
              <div className="kvValue">{String(person.phone ?? "") || "–"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">소속</div>
              <div className="kvValue">
                {(person.company as { id: string; name_ko: string } | null) ? (
                  <Link href={`/customers/${(person.company as { id: string }).id}`}>
                    {(person.company as { name_ko: string }).name_ko}
                  </Link>
                ) : (
                  "–"
                )}
              </div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">네트워크 분류</div>
              <div className="kvValue">{label(profile?.network_segment) || "미분류"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">핵심 분야</div>
              <div className="kvValue">{profile?.core_field ?? "–"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">전문성</div>
              <div className="kvValue">{profile?.expertise_detail ?? "–"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">NDA</div>
              <div className="kvValue">{docState(profile?.nda_status)}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">프로필 문서</div>
              <div className="kvValue">{docState(profile?.profile_status)}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">위촉 계약</div>
              <div className="kvValue">{docState(profile?.appointment_status)}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">메모</div>
              <div className="kvValue">{String(person.memo ?? "") || profile?.memo || "–"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">참여 프로젝트</div>
          <div className="panelMeta">{projects.length}건</div>
        </div>
        <DealTable rows={projects} roleColumn emptyText="참여 중인 프로젝트가 없습니다." />
      </div>

      {companyLinks.length > 0 ? (
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">관계사</div>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>회사</th>
                  <th>관계</th>
                  <th>직함</th>
                </tr>
              </thead>
              <tbody>
                {companyLinks.map((link, index) => (
                  <tr key={index}>
                    <td>
                      {link.company ? (
                        <Link className="tableLink" href={`/customers/${link.company.id}`}>
                          {link.company.name_ko}
                        </Link>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td>{link.relationship_type === "affiliation" ? "소속" : link.relationship_type}</td>
                    <td>{link.title ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">필요 문서</div>
          <div className="panelMeta">NDA · 프로필 · 위촉</div>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>문서</th>
                <th>종류</th>
                <th>상태</th>
                <th>기한</th>
              </tr>
            </thead>
            <tbody>
              {documentRequirements.length === 0 ? (
                <tr>
                  <td colSpan={4} className="emptyCell">
                    등록된 필요 문서가 없습니다.
                  </td>
                </tr>
              ) : (
                documentRequirements.map((req) => (
                  <tr key={String(req.id)}>
                    <td>{req.title}</td>
                    <td>{req.requirement_type}</td>
                    <td>{label(req.status)}</td>
                    <td className="mutedText">{formatDate(req.required_by ?? req.expires_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DocumentsPanel
        entityType="person"
        entityId={id}
        returnPath={`/partners/${id}`}
        documents={documents}
        requirements={documentRequirements as { id: string; requirement_type: string | null; title: string | null; status: string | null }[]}
        title="보관 문서"
      />

      {admin ? (
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">프로필 수정</div>
            <div className="panelMeta">관리자</div>
          </div>
          <div className="panelBody">
            <form action={updateAction} className="formGrid">
              <div className="field">
                <label>이름</label>
                <input name="name_ko" defaultValue={String(person.name_ko ?? "")} required />
              </div>
              <div className="field">
                <label>구분</label>
                <select name="partner_status" defaultValue={profile?.partner_status ?? ""}>
                  <option value="">미분류</option>
                  {PARTNER_CLASS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>직함</label>
                <input name="title" defaultValue={String(person.title ?? "")} />
              </div>
              <div className="field">
                <label>네트워크 분류</label>
                <select name="network_segment" defaultValue={profile?.network_segment ?? "unknown"}>
                  {SEGMENT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {label(option)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>이메일</label>
                <input name="email" defaultValue={String(person.email ?? "")} />
              </div>
              <div className="field">
                <label>연락처</label>
                <input name="phone" defaultValue={String(person.phone ?? "")} />
              </div>
              <div className="field">
                <label>NDA</label>
                <select name="nda_status" defaultValue={profile?.nda_status ?? "Unknown"}>
                  {DOC_STATE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {docState(option)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>프로필 문서</label>
                <select name="profile_status" defaultValue={profile?.profile_status ?? "Unknown"}>
                  {DOC_STATE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {docState(option)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>위촉 계약</label>
                <select name="appointment_status" defaultValue={profile?.appointment_status ?? "Unknown"}>
                  {DOC_STATE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {docState(option)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>핵심 분야</label>
                <input name="core_field" defaultValue={profile?.core_field ?? ""} />
              </div>
              <div className="field full">
                <label>메모</label>
                <textarea name="memo" defaultValue={String(person.memo ?? "")} />
              </div>
              <div className="formActions full">
                <button className="primaryButton" type="submit">
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
