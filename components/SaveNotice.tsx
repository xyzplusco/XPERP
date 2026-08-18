export function SaveNotice({ saved, error }: { saved?: string; error?: string }) {
  if (saved) return <p className="notice noticeOk">저장되었습니다.</p>;
  if (!error) return null;
  const messages: Record<string, string> = {
    save: "저장에 실패했습니다. 권한을 확인하세요.",
    forbidden: "관리자만 수정할 수 있습니다.",
    upload: "파일 업로드에 실패했습니다.",
    toobig: "50MB 이하 파일만 업로드할 수 있습니다.",
    empty: "내용을 입력하세요.",
    person: "해당 이름의 파트너를 찾을 수 없거나 동명이인이 있습니다.",
  };
  return <p className="notice noticeError">{messages[error] ?? "요청을 처리하지 못했습니다."}</p>;
}
