import { uploadDocumentAction } from "@/lib/actions";
import { formatDateTime, label } from "@/lib/labels";
import type { EntityDocument } from "@/lib/queries";

type Requirement = {
  id: string;
  requirement_type?: string | null;
  title?: string | null;
  status?: string | null;
};

export function DocumentsPanel({
  entityType,
  entityId,
  returnPath,
  documents,
  requirements = [],
  title = "문서",
}: {
  entityType: "person" | "company" | "project" | "event";
  entityId: string;
  returnPath: string;
  documents: EntityDocument[];
  requirements?: Requirement[];
  title?: string;
}) {
  const openRequirements = requirements.filter((req) =>
    ["needed", "requested", "expired"].includes(req.status ?? "")
  );

  return (
    <div className="panel">
      <div className="panelHeader">
        <div className="panelTitle">{title}</div>
        <div className="panelMeta">{documents.length}건 보관</div>
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>문서명</th>
              <th>종류</th>
              <th>구분</th>
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
      <div className="panelBody" style={{ borderTop: "1px solid var(--line)" }}>
        <form action={uploadDocumentAction} className="inlineForm">
          <input type="hidden" name="entity_type" value={entityType} />
          <input type="hidden" name="entity_id" value={entityId} />
          <input type="hidden" name="return_path" value={returnPath} />
          <div className="field">
            <label>파일</label>
            <input type="file" name="file" required />
          </div>
          <div className="field">
            <label>문서 종류</label>
            <input type="text" name="document_type" placeholder="NDA, 계약서, 프로필 …" list="doc-types" />
            <datalist id="doc-types">
              <option value="NDA" />
              <option value="계약서" />
              <option value="프로필" />
              <option value="위촉계약" />
              <option value="MOU" />
              <option value="제안서" />
              <option value="IR 자료" />
            </datalist>
          </div>
          <div className="field">
            <label>제목 (선택)</label>
            <input type="text" name="title" />
          </div>
          <div className="field">
            <label>보안 구분</label>
            <select name="sensitivity" defaultValue="internal">
              <option value="internal">내부</option>
              <option value="confidential">대외비</option>
              <option value="restricted">제한</option>
            </select>
          </div>
          {openRequirements.length > 0 ? (
            <div className="field">
              <label>필요 문서 충족 (선택)</label>
              <select name="requirement_id" defaultValue="">
                <option value="">해당 없음</option>
                {openRequirements.map((req) => (
                  <option key={req.id} value={req.id}>
                    {req.requirement_type ?? req.title ?? req.id} ({label(req.status)})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button className="primaryButton" type="submit">
            업로드
          </button>
        </form>
      </div>
    </div>
  );
}
