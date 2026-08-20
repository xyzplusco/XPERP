import Link from "next/link";
import { getAllDocuments } from "@/lib/queries";
import { formatDate, formatDateTime, label } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const { documents, requirements } = await getAllDocuments();

  return (
    <>
      <div className="pageHeader">
        <h1>문서</h1>
        <div className="pageHeaderMeta">
          보관 {documents.length}건 · 미비 {requirements.length}건
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">보관 문서</div>
          
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>문서명</th>
                <th>종류</th>
                <th>보안 구분</th>
                <th>등록일</th>
                <th>파일</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="emptyCell">
                    보관된 문서가 없습니다.
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.title}</td>
                    <td>{doc.document_type}</td>
                    <td>{doc.sensitivity === "internal" ? "내부" : doc.sensitivity === "confidential" ? "대외비" : "제한"}</td>
                    <td className="mutedText">{formatDateTime(doc.uploaded_at)}</td>
                    <td>
                      {doc.url ? (
                        <a className="tableLink" href={doc.url} target="_blank" rel="noreferrer">
                          {doc.file_name ?? "열기"}
                        </a>
                      ) : (
                        <span className="faintText">–</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">필요 문서 (미비)</div>
          <div className="panelMeta">NDA · 프로필 · 위촉 · 계약</div>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>대상</th>
                <th>문서</th>
                <th>종류</th>
                <th>상태</th>
                <th>기한</th>
              </tr>
            </thead>
            <tbody>
              {requirements.length === 0 ? (
                <tr>
                  <td colSpan={5} className="emptyCell">
                    미비 문서가 없습니다.
                  </td>
                </tr>
              ) : (
                requirements.map((req) => (
                  <tr key={req.id}>
                    <td>
                      {req.person ? (
                        <Link className="tableLink" href={`/partners/${req.person.id}`}>
                          {req.person.name_ko}
                        </Link>
                      ) : req.company ? (
                        <Link className="tableLink" href={`/customers/${req.company.id}`}>
                          {req.company.name_ko}
                        </Link>
                      ) : req.project ? (
                        <Link className="tableLink" href={`/projects/${req.project.id}`}>
                          {req.project.name}
                        </Link>
                      ) : (
                        req.subject_text ?? "–"
                      )}
                    </td>
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
    </>
  );
}
