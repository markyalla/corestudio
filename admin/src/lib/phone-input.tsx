"use client";

import { useState } from "react";
import { COUNTRIES, DEFAULT_DIAL_CODE, combinePhone } from "./phone";

/** Country-code dropdown + local-number field. Calls onChange with the
 *  combined "+<dialCode><digits>" value on every keystroke, same shape the
 *  backend's phone validation already expects — callers just store that in
 *  their form state like any other text field. Uncontrolled by design (no
 *  `value` prop): every current call site lives inside a modal/page that
 *  unmounts on close or navigates away on success, so there's nothing to
 *  resync from externally — give it a `key` if a future caller needs to
 *  force-reset one that stays mounted. */
export function PhoneInput({
  onChange,
  className = "",
}: {
  onChange: (combined: string) => void;
  className?: string;
}) {
  const [dialCode, setDialCode] = useState(DEFAULT_DIAL_CODE);
  const [local, setLocal] = useState("");

  return (
    <div className={`flex gap-1 ${className}`}>
      <select
        value={dialCode}
        onChange={(e) => {
          setDialCode(e.target.value);
          onChange(combinePhone(e.target.value, local));
        }}
        className="w-24 rounded-lg border border-stone-300 bg-white px-1.5 py-2 text-sm"
      >
        {COUNTRIES.map((c) => (
          <option key={`${c.iso2}-${c.dialCode}`} value={c.dialCode}>
            {c.dialCode} {c.iso2}
          </option>
        ))}
      </select>
      <input
        type="tel"
        placeholder="542512558"
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          onChange(combinePhone(dialCode, e.target.value));
        }}
        className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
