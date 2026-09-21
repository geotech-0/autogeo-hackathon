import { SITE } from "../contracts";
import { getDatabase } from "./database";

export interface AttachmentMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  created_at: string;
  site_id: string;
  source_id: string;
}
export interface StoredAttachment extends AttachmentMeta {
  blob: Blob;
}
export interface ArchivedAttachment extends AttachmentMeta {
  base64: string;
}
const MAX_BYTES = 25 * 1024 * 1024;
const types: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  csv: "text/csv",
  txt: "text/plain",
  json: "application/json",
};
export const attachmentIds = (value: unknown): string[] => {
  const found = new Set<string>();
  function visit(v: unknown) {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    for (const [k, x] of Object.entries(v)) {
      if (k === "attachment_ids" && Array.isArray(x))
        x.forEach((id) => {
          if (typeof id === "string") found.add(id);
        });
      else visit(x);
    }
  }
  visit(value);
  return [...found];
};
const hash = async (bytes: ArrayBuffer) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
function verifiedName(name: string) {
  const safe =
    name
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\u0000-\u001f\u007f]/g, "")
      .trim() || "";
  if (
    !safe ||
    safe.length > 180 ||
    !types[safe.split(".").pop()!.toLowerCase()]
  )
    throw new Error("PDF·PNG·JPG·WebP·CSV·TXT·JSON 파일을 선택해주세요.");
  return safe;
}
export async function saveAttachment(
  file: File,
  sourceId = "user-attachment",
): Promise<AttachmentMeta> {
  const name = verifiedName(file.name);
  if (!file.size || file.size > MAX_BYTES)
    throw new Error("첨부파일은 0바이트보다 크고 25MB 이하여야 합니다.");
  const bytes = await file.arrayBuffer();
  const meta: AttachmentMeta = {
    id: crypto.randomUUID(),
    name,
    mime: types[name.split(".").pop()!.toLowerCase()],
    size: bytes.byteLength,
    sha256: await hash(bytes),
    created_at: new Date().toISOString(),
    site_id: SITE.id,
    source_id: sourceId,
  };
  const db = await getDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("attachments", "readwrite");
    tx.objectStore("attachments").put({
      ...meta,
      blob: new Blob([bytes], { type: meta.mime }),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        new Error("첨부파일을 보관하지 못했습니다. 저장 공간을 확인해주세요."),
      );
  });
  return meta;
}
export async function readAttachment(
  id: string,
): Promise<StoredAttachment | undefined> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const q = db.transaction("attachments").objectStore("attachments").get(id);
    q.onsuccess = () =>
      resolve(q.result?.site_id === SITE.id ? q.result : undefined);
    q.onerror = () => reject(new Error("첨부파일을 읽지 못했습니다."));
  });
}
/** Caller owns the returned object URL and must revoke it when its viewer closes. */
export async function getAttachmentUrl(id: string): Promise<string> {
  const item = await readAttachment(id);
  if (!item)
    throw new Error(
      "첨부파일이 없습니다. 첨부를 포함한 이력 파일을 가져오세요.",
    );
  return URL.createObjectURL(item.blob);
}
export async function archiveAttachments(
  ids: string[],
): Promise<ArchivedAttachment[]> {
  return Promise.all(
    ids.map(async (id) => {
      const item = await readAttachment(id);
      if (!item)
        throw new Error(
          "연결된 첨부파일이 없어 내보내기를 완료할 수 없습니다.",
        );
      const { blob, ...meta } = item;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let data = "";
      for (let i = 0; i < bytes.length; i += 16384)
        data += String.fromCharCode(...bytes.subarray(i, i + 16384));
      return { ...meta, base64: btoa(data) };
    }),
  );
}
export async function decodeArchiveAttachments(
  input: unknown,
): Promise<StoredAttachment[]> {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 100)
    throw new Error("첨부 목록 형식 또는 개수가 올바르지 않습니다.");
  let total = 0;
  const ids = new Set();
  return Promise.all(
    input.map(async (a: ArchivedAttachment) => {
      if (
        !a ||
        typeof a.id !== "string" ||
        !a.id ||
        ids.has(a.id) ||
        a.site_id !== SITE.id ||
        typeof a.name !== "string" ||
        typeof a.base64 !== "string" ||
        typeof a.source_id !== "string" ||
        !a.source_id ||
        !Number.isFinite(Date.parse(a.created_at)) ||
        !Number.isInteger(a.size) ||
        a.size <= 0 ||
        a.size > MAX_BYTES
      )
        throw new Error("첨부 출처·현장·파일 정보가 올바르지 않습니다.");
      ids.add(a.id);
      total += a.size;
      if (total > 100 * 1024 * 1024)
        throw new Error("첨부 합계는 100MB 이하로 가져올 수 있습니다.");
      const name = verifiedName(a.name);
      const mime = types[name.split(".").pop()!.toLowerCase()];
      if (
        a.mime !== mime ||
        a.base64.length > Math.ceil(MAX_BYTES / 3) * 4 + 4 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(a.base64)
      )
        throw new Error("첨부 형식이 올바르지 않습니다.");
      let raw: string;
      try {
        raw = atob(a.base64);
      } catch {
        throw new Error("첨부 데이터가 손상되었습니다.");
      }
      const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      if (
        bytes.byteLength !== a.size ||
        (await hash(bytes.buffer)) !== a.sha256
      )
        throw new Error("첨부 크기 또는 SHA-256이 원본과 다릅니다.");
      const { base64, ...meta } = a;
      return { ...meta, name, blob: new Blob([bytes], { type: mime }) };
    }),
  );
}
