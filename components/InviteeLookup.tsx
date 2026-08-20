"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { addInviteeFromPersonAction, createPersonAndInviteAction } from "@/lib/actions";
import type { DirectoryPerson } from "@/lib/queries";

export function InviteeLookup({
  eventId,
  people,
  invitedPersonIds,
}: {
  eventId: string;
  people: DirectoryPerson[];
  invitedPersonIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const invited = useMemo(() => new Set(invitedPersonIds), [invitedPersonIds]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return people
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.company ?? "").toLowerCase().includes(q) ||
          (p.email ?? "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [people, query]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 4000);
  };

  const add = (person: DirectoryPerson) => {
    setOpen(false);
    setQuery("");
    startTransition(async () => {
      const result = await addInviteeFromPersonAction(eventId, person.id);
      flash(result.message);
    });
  };

  const createNew = (formData: FormData) => {
    const read = (key: string) => String(formData.get(key) ?? "");
    startTransition(async () => {
      const result = await createPersonAndInviteAction(eventId, {
        name: read("name"),
        company: read("company"),
        title: read("title"),
        email: read("email"),
        phone: read("phone"),
      });
      flash(result.message);
      if (result.ok) {
        setCreating(false);
        setQuery("");
      }
    });
  };

  return (
    <div className="lookupWrap">
      <div className="lookupRow">
        <label className="lookupLabel">참석자 추가</label>
        <div className="lookupField">
          <input
            ref={inputRef}
            value={query}
            placeholder="이름 · 회사 · 이메일 두 글자부터"
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setCreating(false);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
            autoComplete="off"
          />
          {open && query.trim().length >= 2 && !creating ? (
            <div className="lookupMenu">
              {matches.map((person) => {
                const already = invited.has(person.id);
                return (
                  <button
                    key={person.id}
                    type="button"
                    className="lookupItem"
                    disabled={already || pending}
                    onClick={() => add(person)}
                  >
                    <span className="lookupName">{person.name}</span>
                    <span className="lookupMeta">
                      {[person.company, person.title, person.email].filter(Boolean).join(" · ") || "정보 없음"}
                    </span>
                    {already ? <span className="lookupMeta">명단에 있음</span> : null}
                  </button>
                );
              })}
              {matches.length === 0 ? <div className="lookupEmpty">일치하는 파트너가 없습니다.</div> : null}
              <button
                type="button"
                className="lookupItem lookupCreate"
                onClick={() => {
                  setCreating(true);
                  setOpen(false);
                }}
              >
                &lsquo;{query.trim()}&rsquo; 새 파트너로 등록하고 추가
              </button>
            </div>
          ) : null}
        </div>
        {notice ? <span className="copyResult">{notice}</span> : null}
      </div>

      {creating ? (
        <form action={createNew} className="formGrid lookupForm">
          <div className="field">
            <label>이름</label>
            <input name="name" defaultValue={query.trim()} required />
          </div>
          <div className="field">
            <label>소속</label>
            <input name="company" />
          </div>
          <div className="field">
            <label>직함</label>
            <input name="title" />
          </div>
          <div className="field">
            <label>이메일</label>
            <input name="email" type="email" />
          </div>
          <div className="field">
            <label>연락처</label>
            <input name="phone" />
          </div>
          <div className="formActions full">
            <button className="primaryButton" type="submit" disabled={pending}>
              등록하고 명단에 추가
            </button>
            <button className="secondaryButton" type="button" onClick={() => setCreating(false)}>
              취소
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
