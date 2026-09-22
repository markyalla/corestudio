"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fileToResizedDataUrl } from "@/lib/image";

async function api(path: string, method: string, body: unknown): Promise<string | null> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return data.error ?? `Request failed (${res.status})`;
  }
  return null;
}

export function TrainerPhotoUpload({ trainerId, photoUrl }: { trainerId: string; photoUrl: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-4">
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-200 text-xs text-stone-500">
          No photo
        </span>
      )}
      <div>
        <label className="cursor-pointer rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50">
          {busy ? "Uploading…" : photoUrl ? "Change photo" : "Add photo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setError(null);
              setBusy(true);
              try {
                const photoDataUrl = await fileToResizedDataUrl(file);
                const err = await api(`/api/trainers/${trainerId}`, "PATCH", { photoDataUrl });
                if (err) setError(err);
                else router.refresh();
              } catch {
                setError("Couldn't read that image — try a different file.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
