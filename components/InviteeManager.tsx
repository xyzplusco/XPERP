"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  addInviteesAction,
  deleteInviteeAction,
  updateInviteeAction,
} from "@/lib/actions";
import { InviteeLookup } from "@/components/InviteeLookup";
import type { DirectoryPerson } from "@/lib/queries";

export type Invitee = {
  id: string;
  name: string | null;
  company_name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  email_sent: boolean;
  sms_sent: boolean;
  response_received: boolean;
  will_attend: boolean | null;
  attendance_confirmed: boolean;
  person_id: string | null;
};

const FLAGS: { key: keyof Invitee; label: string }[] = [
  { key: "email_sent", label: "이메일" },
  { key: "sms_sent", label: "문자" },
  { key: "response_received", label: "회신" },
  { key: "attendance_confirmed", label: "참가확정" },
];

export function InviteeManager({
  eventId,
  invitees,
  people,
}: {
  eventId: string;
  invitees: Invitee[];
  people: DirectoryPerson[];
}) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  const summary = useMemo(() => {
    return {
      total: invitees.length,
      emailSent: invitees.filter((i) => i.email_sent).length,
      smsSent: invitees.filter((i) => i.sms_sent).length,
      replied: invitees.filter((i) => i.response_received).length,
      confirmed: invitees.filter((i) => i.attendance_confirmed).length,
      declined: invitees.filter((i) => i.will_attend === false).length,
    };
  }, [invitees]);

  const setFlag = (invitee: Invitee, key: string, value: boolean) => {
    const formData = new FormData();
    formData.set(key, value ? "true" : "false");
    startTransition(() => {
      void updateInviteeAction(invitee.id, eventId, formData);
    });
  };

  const setAttend = (invitee: Invitee, value: string) => {
    const formData = new FormData();
    formData.set("will_attend", value);
    startTransition(() => {
      void updateInviteeAction(invitee.id, eventId, formData);
    });
  };

  const copy = async (values: (string | null)[], labelText: string) => {
    const list = Array.from(new Set(values.filter((v): v is string => Boolean(v && v.trim()))));
    if (list.length === 0) {
      setCopied(`${labelText}: 복사할 값이 없습니다`);
      return;
    }
    await navigator.clipboard.writeText(list.join(", "));
    setCopied(`${labelText} ${list.length}건 복사됨`);
    setTimeout(() => setCopied(""), 4000);
  };

  const target = selected.size > 0 ? invitees.filter((i) => selected.has(i.id)) : invitees;
  const notReplied = invitees.filter((i) => !i.response_received);
  const confirmed = invitees.filter((i) => i.attendance_confirmed);

  const toggleAll = () => {
    setSelected(selected.size === invitees.length ? new Set() : new Set(invitees.map((i) => i.id)));
  };

  return (
    <>
      <div className="summaryRow">
        <div className="summaryCell">
          <div className="summaryLabel">초대</div>
          <div className="summaryValue">{summary.total}</div>
        </div>
        <div className="summaryCell">
          <div className="summaryLabel">이메일 발송</div>
          <div className="summaryValue">{summary.emailSent}</div>
        </div>
        <div className="summaryCell">
          <div className="summaryLabel">문자 발송</div>
          <div className="summaryValue">{summary.smsSent}</div>
        </div>
        <div className="summaryCell">
          <div className="summaryLabel">회신</div>
          <div className="summaryValue">{summary.replied}</div>
        </div>
        <div className="summaryCell">
          <div className="summaryLabel">참가 확정</div>
          <div className="summaryValue">{summary.confirmed}</div>
        </div>
        <div className="summaryCell">
          <div className="summaryLabel">불참</div>
          <div className="summaryValue">{summary.declined}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">참석자</div>
          <div className="panelMeta">
            {selected.size > 0 ? `${selected.size}명 선택됨` : "행을 선택하면 선택한 사람만 복사됩니다"}
          </div>
        </div>

        <div className="panelBody" style={{ borderBottom: "1px solid var(--line)" }}>
          <InviteeLookup
            eventId={eventId}
            people={people}
            invitedPersonIds={invitees.map((i) => i.person_id).filter((v): v is string => Boolean(v))}
          />
          <div className="copyRow">
            <button
              className="secondaryButton"
              type="button"
              onClick={() => copy(target.map((i) => i.email), selected.size > 0 ? "선택 이메일" : "전체 이메일")}
            >
              이메일 전체복사
            </button>
            <button
              className="secondaryButton"
              type="button"
              onClick={() => copy(target.map((i) => i.phone), selected.size > 0 ? "선택 번호" : "전체 번호")}
            >
              휴대폰번호 전체복사
            </button>
            <button
              className="secondaryButton"
              type="button"
              onClick={() => copy(notReplied.map((i) => i.email), "미회신자 이메일")}
            >
              미회신자 이메일 ({notReplied.length})
            </button>
            <button
              className="secondaryButton"
              type="button"
              onClick={() => copy(confirmed.map((i) => i.name), "참가확정 명단")}
            >
              참가확정 명단 ({confirmed.length})
            </button>
            <button className="secondaryButton" type="button" onClick={() => setShowPaste((v) => !v)}>
              {showPaste ? "붙여넣기 닫기" : "명단 붙여넣기"}
            </button>
            {copied ? <span className="copyResult">{copied}</span> : null}
          </div>

          {showPaste ? (
            <form action={addInviteesAction.bind(null, eventId)} style={{ marginTop: 12 }}>
              <div className="field">
                <label>엑셀에서 복사해 붙여넣으세요 — 한 줄에 한 명</label>
                <textarea
                  name="bulk"
                  rows={6}
                  required
                  placeholder={"홍길동\t그룹엑스\t대표\thong@example.com\t010-1234-5678\n김철수, 터미널즈, 팀장, kim@example.com, 010-2222-3333"}
                />
                <span className="faintText" style={{ fontSize: 12 }}>
                  이름 / 회사 / 직함 / 이메일 / 전화 순. 탭·콤마 모두 인식하고, 뒤쪽은 비어도 됩니다.
                  이름이 파트너 DB와 정확히 일치하면 자동으로 연결됩니다.
                </span>
              </div>
              <div className="formActions">
                <button className="primaryButton" type="submit">
                  일괄 추가
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th className="checkCell">
                  <input
                    type="checkbox"
                    checked={invitees.length > 0 && selected.size === invitees.length}
                    onChange={toggleAll}
                  />
                </th>
                <th>이름</th>
                <th>회사</th>
                <th>직함</th>
                <th>이메일</th>
                <th>연락처</th>
                {FLAGS.map((flag) => (
                  <th key={String(flag.key)} className="checkCell">
                    {flag.label}
                  </th>
                ))}
                <th>참석</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invitees.length === 0 ? (
                <tr>
                  <td colSpan={12} className="emptyCell">
                    참석자가 없습니다. 위 &lsquo;명단 붙여넣기&rsquo;로 한 번에 추가하세요.
                  </td>
                </tr>
              ) : (
                invitees.map((invitee) => (
                  <tr key={invitee.id} style={pending ? { opacity: 0.7 } : undefined}>
                    <td className="checkCell">
                      <input
                        type="checkbox"
                        checked={selected.has(invitee.id)}
                        onChange={() => {
                          const next = new Set(selected);
                          if (next.has(invitee.id)) next.delete(invitee.id);
                          else next.add(invitee.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td>
                      {invitee.person_id ? (
                        <Link className="tableLink" href={`/partners/${invitee.person_id}`}>
                          {invitee.name}
                        </Link>
                      ) : (
                        invitee.name
                      )}
                    </td>
                    <td>{invitee.company_name ?? "–"}</td>
                    <td>{invitee.title ?? "–"}</td>
                    <td className="mutedText">{invitee.email ?? "–"}</td>
                    <td className="mutedText">{invitee.phone ?? "–"}</td>
                    {FLAGS.map((flag) => (
                      <td key={String(flag.key)} className="checkCell">
                        <input
                          type="checkbox"
                          checked={Boolean(invitee[flag.key])}
                          onChange={(event) => setFlag(invitee, String(flag.key), event.target.checked)}
                        />
                      </td>
                    ))}
                    <td>
                      <select
                        value={invitee.will_attend === true ? "yes" : invitee.will_attend === false ? "no" : ""}
                        onChange={(event) => setAttend(invitee, event.target.value)}
                        style={{ fontSize: 12.5, padding: "2px 4px", fontFamily: "inherit" }}
                      >
                        <option value="">미정</option>
                        <option value="yes">참석</option>
                        <option value="no">불참</option>
                      </select>
                    </td>
                    <td>
                      <form action={deleteInviteeAction.bind(null, invitee.id, eventId)}>
                        <button className="smallButton" type="submit">
                          삭제
                        </button>
                      </form>
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
