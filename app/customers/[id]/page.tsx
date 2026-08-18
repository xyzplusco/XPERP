import Link from "next/link";
import { notFound } from "next/navigation";
import { DealTable } from "@/components/DealTable";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { SaveNotice } from "@/components/SaveNotice";
import { updateCustomerAction } from "@/lib/actions";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { MeetingNotesPanel } from "@/components/MeetingNotesPanel";
import { getCompanyMeetingNotes, getCustomer } from "@/lib/queries";
import { formatAmount, formatDate, label } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const [user, data, meetingNotes] = await Promise.all([
    getSessionUser(),
    getCustomer(id),
    getCompanyMeetingNotes(id),
  ]);
  if (!data) notFound();

  const { company, projects, documentRequirements, tasks, contacts, documents, revenueSum } = data;
  const admin = isAdmin(user);
  const updateAction = updateCustomerAction.bind(null, id);
  const openTasks = tasks.filter((t) => ["backlog", "in_progress", "waiting", "blocked"].includes(t.status ?? ""));

  return (
    <>
      <div className="detailHeader">
        <div className="detailKicker">
          <Link href="/customers">고객사</Link> / C-{String(company.id).replace(/-/g, "").slice(0, 8).toUpperCase()}
        </div>
        <div className="detailTitleRow">
          <h1>{company.name_ko}</h1>
          {company.industry ? <span className="detailBadge">{company.industry}</span> : null}
        </div>
        <div className="detailSub">
          프로젝트 {projects.length}건
          {revenueSum > 0 ? ` · 예상 매출 합계 ${formatAmount(revenueSum)}` : ""}
          {company.representative_name ? ` · 대표 ${company.representative_name}` : ""}
        </div>
      </div>

      <SaveNotice saved={saved} error={error} />

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">기업 정보</div>
        </div>
        <div className="panelBody">
          <div className="kvGrid">
            <div className="kvItem">
              <div className="kvLabel">대표</div>
              <div className="kvValue">{company.representative_name ?? "–"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">소재지</div>
              <div className="kvValue">{company.location ?? "–"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">웹사이트</div>
              <div className="kvValue">
                {company.website_url ? (
                  <a href={String(company.website_url)} target="_blank" rel="noreferrer">
                    {company.website_url}
                  </a>
                ) : (
                  "–"
                )}
              </div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">핵심 제품/서비스</div>
              <div className="kvValue">{company.core_product ?? "–"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">사업 개요</div>
              <div className="kvValue">{company.business_summary ?? "–"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">고객 니즈</div>
              <div className="kvValue">{company.needs ?? "–"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">다음 액션</div>
              <div className="kvValue">{company.next_action ?? "–"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">메모</div>
              <div className="kvValue">{company.memo ?? "–"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">진행 프로젝트 · 계약</div>
          <div className="panelMeta">{projects.length}건</div>
        </div>
        <DealTable rows={projects} />
      </div>

      <div className="twoColumn">
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">담당자</div>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>직함</th>
                  <th>이메일</th>
                  <th>연락처</th>
                </tr>
              </thead>
              <tbody>
                {contacts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="emptyCell">
                      등록된 담당자가 없습니다.
                    </td>
                  </tr>
                ) : (
                  contacts.map((person) => (
                    <tr key={String(person.id)}>
                      <td>
                        <Link className="tableLink" href={`/partners/${person.id}`}>
                          {person.name_ko}
                        </Link>
                      </td>
                      <td>{person.title ?? "–"}</td>
                      <td className="mutedText">{person.email ?? "–"}</td>
                      <td className="mutedText">{person.phone ?? "–"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">미처리 액션</div>
            <div className="panelMeta">{openTasks.length}건</div>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>액션</th>
                  <th>상태</th>
                  <th>기한</th>
                </tr>
              </thead>
              <tbody>
                {openTasks.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="emptyCell">
                      미처리 액션이 없습니다.
                    </td>
                  </tr>
                ) : (
                  openTasks.slice(0, 15).map((task) => (
                    <tr key={String(task.id)}>
                      <td>{task.title}</td>
                      <td>{label(task.status)}</td>
                      <td className="mutedText">{formatDate(task.due_date)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">필요 문서</div>
          <div className="panelMeta">계약서 · NDA · 기타</div>
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

      <MeetingNotesPanel
        companyId={id}
        returnPath={`/customers/${id}`}
        notes={meetingNotes}
        user={user}
        showProjectColumn
      />

      <DocumentsPanel
        entityType="company"
        entityId={id}
        returnPath={`/customers/${id}`}
        documents={documents}
        requirements={documentRequirements as { id: string; requirement_type: string | null; title: string | null; status: string | null }[]}
        title="보관 문서"
      />

      {admin ? (
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">기업 정보 수정</div>
            <div className="panelMeta">관리자</div>
          </div>
          <div className="panelBody">
            <form action={updateAction} className="formGrid">
              <div className="field">
                <label>고객사명</label>
                <input name="name_ko" defaultValue={String(company.name_ko ?? "")} required />
              </div>
              <div className="field">
                <label>산업</label>
                <input name="industry" defaultValue={String(company.industry ?? "")} />
              </div>
              <div className="field">
                <label>대표</label>
                <input name="representative_name" defaultValue={String(company.representative_name ?? "")} />
              </div>
              <div className="field">
                <label>소재지</label>
                <input name="location" defaultValue={String(company.location ?? "")} />
              </div>
              <div className="field">
                <label>웹사이트</label>
                <input name="website_url" defaultValue={String(company.website_url ?? "")} />
              </div>
              <div className="field">
                <label>핵심 제품/서비스</label>
                <input name="core_product" defaultValue={String(company.core_product ?? "")} />
              </div>
              <div className="field full">
                <label>사업 개요</label>
                <textarea name="business_summary" defaultValue={String(company.business_summary ?? "")} />
              </div>
              <div className="field full">
                <label>고객 니즈</label>
                <textarea name="needs" defaultValue={String(company.needs ?? "")} />
              </div>
              <div className="field">
                <label>다음 액션</label>
                <input name="next_action" defaultValue={String(company.next_action ?? "")} />
              </div>
              <div className="field">
                <label>메모</label>
                <input name="memo" defaultValue={String(company.memo ?? "")} />
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
