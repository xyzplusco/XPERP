"use client";

import { useEffect, useRef, useState } from "react";

export type NewField = {
  name: string;
  label: string;
  type?: "text" | "email" | "select" | "datalist";
  options?: string[];
  required?: boolean;
  listId?: string;
  listValues?: string[];
};

export function NewRecordDialog({
  label,
  action,
  fields,
}: {
  label: string;
  action: (formData: FormData) => void | Promise<void>;
  fields: NewField[];
}) {
  const [open, setOpen] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) firstRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button className="primaryButton" type="button" onClick={() => setOpen(true)}>
        {label}
      </button>

      {open ? (
        <div className="modalBackdrop" onClick={() => setOpen(false)}>
          <div className="modalCard" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <span>{label}</span>
              <button className="smallButton" type="button" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>
            <form action={action} className="modalBody">
              {fields.map((field, index) => (
                <div className="field" key={field.name}>
                  <label>{field.label}</label>
                  {field.type === "select" ? (
                    <select name={field.name} defaultValue={field.options?.[0] ?? ""}>
                      {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input
                        ref={index === 0 ? firstRef : undefined}
                        name={field.name}
                        type={field.type === "email" ? "email" : "text"}
                        required={field.required}
                        autoComplete="off"
                        list={field.listId}
                      />
                      {field.listId && field.listValues ? (
                        <datalist id={field.listId}>
                          {field.listValues.map((value) => (
                            <option key={value} value={value} />
                          ))}
                        </datalist>
                      ) : null}
                    </>
                  )}
                </div>
              ))}
              <div className="formActions">
                <button className="secondaryButton" type="button" onClick={() => setOpen(false)}>
                  취소
                </button>
                <button className="primaryButton" type="submit">
                  등록
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
