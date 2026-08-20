export function SaveNotice({
  saved,
  error,
  reason,
}: {
  saved?: string;
  error?: string;
  reason?: string;
}) {
  if (saved) return <p className="notice noticeOk">저장되었습니다.</p>;
  if (!error) return null;
  const messages: Record<string, string> = {
    save: "저장하지 못했습니다.",
    forbidden: "마스터 어드민만 할 수 있습니다.",
    upload: "파일 업로드에 실패했습니다.",
    toobig: "50MB 이하 파일만 업로드할 수 있습니다.",
    empty: "내용을 입력하세요.",
    person: "해당 이름의 파트너를 찾을 수 없거나 동명이인이 있습니다.",
    duplicate: "같은 이름의 파트너가 여러 명입니다. 파트너 이름을 구분되게 바꾼 뒤 다시 시도하세요.",
    email: "올바른 이메일을 입력하세요.",
    exists: "이미 존재하는 이메일입니다.",
    owner: "마스터 어드민은 이 화면에서 만들거나 바꿀 수 없습니다.",
    self: "본인 계정은 삭제할 수 없습니다.",
    nokey: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않아 계정을 만들 수 없습니다.",
    weak: "비밀번호는 8자 이상이어야 합니다.",
    mismatch: "두 비밀번호가 다릅니다.",
  };
  return (
    <p className="notice noticeError">
      {messages[error] ?? "요청을 처리하지 못했습니다."}
      {reason ? <span className="noticeReason">{reason}</span> : null}
    </p>
  );
}
