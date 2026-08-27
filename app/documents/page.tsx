import Link from "next/link";
import { SaveNotice } from "@/components/SaveNotice";
import { searchDocuments } from "@/lib/queries";
import { formatDate } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; saved?: string; error?: string }>;
}) {
  const { q, saved, error } = await searchParams;
  const documents = await searchDocuments(q);

  return (
    <>
      <div className="pageHeader">
        <h1>문서</h1>
        <div className="pageHeaderMeta">{documents.length}건</div>
      </div>

      <SaveNotice saved={saved} error={error} />

      <form className="filterBar" method="get">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="계약서, NDA, 파일명, 유형"
          autoComplete="off"
          style={{ flex: "0 1 360px" }}
        />
        <button className="smallButton" type="submit">
          검색
        </button>
        {q ? (
          <Link className="smallButton" href="/documents">
            초기화
          </Link>
        ) : null}
      </form>

      <div className="panel">
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: "28%" }}>제목</th>
                <th style={{ width: "12%" }}>유형</th>
                <th style={{ width: "18%" }}>연결</th>
                <th style={{ width: "22%" }}>파일명</th>
                <th style={{ width: "10%" }}>등록</th>
                <th style={{ width: "10%" }} />
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="emptyCell">
                    {q ? "검색 결과가 없습니다." : "등록된 문서가 없습니다."}
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.title}</td>
                    <td>{doc.document_type}</td>
                    <td>
                      {doc.linkHref ? (
                        <Link className="tableLink" href={doc.linkHref}>
                          {doc.linkedTo}
                        </Link>
                      ) : (
                        <span className="faintText">–</span>
                      )}
                    </td>
                    <td className="mutedText">{doc.file_name ?? "–"}</td>
                    <td className="mutedText">{formatDate(doc.uploaded_at)}</td>
                    <td>
                      {doc.url ? (
                        <a className="smallButton" href={doc.url} target="_blank" rel="noreferrer">
                          열기
                        </a>
                      ) : null}
                    </td>
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
