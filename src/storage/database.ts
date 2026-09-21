import type { ProjectRecord, ProjectRecordDraft } from "../contracts";
import { SITE } from "../contracts";
import { validateArchive, makeRecord, sameRevision } from "./validation.mjs";
import {
  archiveAttachments,
  attachmentIds,
  decodeArchiveAttachments,
  readAttachment,
} from "./attachments";
// The previous synthetic demonstration database is retained, never relabelled or cleared.
const DB_NAME = "autogeo-icheon-v2";
let connection: Promise<IDBDatabase> | undefined;
export function getDatabase(): Promise<IDBDatabase> {
  if (!connection)
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(
          new Error(
            "이 브라우저에서 저장소를 사용할 수 없습니다. 다른 브라우저로 열어주세요.",
          ),
        );
        return;
      }
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(message));
      };
      const timer = setTimeout(
        () =>
          fail(
            "기록 보관함의 응답이 지연되고 있습니다. 다른 AutoGeo 탭을 닫고 이 화면에서 다시 시도해주세요. 저장된 기록은 유지됩니다.",
          ),
        12000,
      );
      const request = indexedDB.open(DB_NAME, 3);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("records"))
          db.createObjectStore("records", { keyPath: "id" });
        if (!db.objectStoreNames.contains("drafts"))
          db.createObjectStore("drafts");
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        if (!db.objectStoreNames.contains("attachments"))
          db.createObjectStore("attachments", { keyPath: "id" });
        if (!db.objectStoreNames.contains("revisions")) {
          db.createObjectStore("revisions", { keyPath: ["id", "revision"] });
          const tx = request.transaction!;
          const cursor = tx.objectStore("records").openCursor();
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (row) {
              tx.objectStore("revisions").put(row.value);
              row.continue();
            }
          };
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) {
          db.close();
          return;
        }
        settled = true;
        clearTimeout(timer);
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        resolve(db);
      };
      request.onerror = () =>
        fail("브라우저 저장소를 열지 못했습니다. 저장 권한을 확인해주세요.");
      request.onblocked = () =>
        fail("다른 AutoGeo 탭을 새로고침하거나 닫은 후 다시 시도해주세요.");
    }).catch((error) => {
      connection = undefined;
      throw error;
    });
  return connection!;
}
async function allRecords(
  storeName: "records" | "revisions",
): Promise<ProjectRecord[]> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const q = db.transaction(storeName).objectStore(storeName).getAll();
    q.onsuccess = () => resolve(q.result as ProjectRecord[]);
    q.onerror = () => reject(q.error);
  });
}
export async function listRecords(): Promise<ProjectRecord[]> {
  return (await allRecords("records"))
    .filter((r) => r.site_id === SITE.id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
export async function listRevisions(id: string): Promise<ProjectRecord[]> {
  return (await allRecords("revisions"))
    .filter((r) => r.id === id && r.site_id === SITE.id)
    .sort((a, b) => b.revision - a.revision);
}
export async function saveRecord(
  draft: ProjectRecordDraft,
): Promise<ProjectRecord> {
  for (const id of attachmentIds(draft.payload)) {
    if (!(await readAttachment(id)))
      throw new Error("연결할 첨부파일이 없습니다. 원본을 다시 첨부해주세요.");
  }
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["records", "revisions"], "readwrite");
    const records = tx.objectStore("records");
    let record: ProjectRecord;
    let reason: Error | undefined;
    const persist = (existing?: ProjectRecord) => {
      try {
        record = makeRecord(draft, existing) as ProjectRecord;
        if (existing) tx.objectStore("revisions").put(existing);
        records.put(record);
        tx.objectStore("revisions").put(record);
      } catch (e) {
        reason = e instanceof Error ? e : new Error(String(e));
        tx.abort();
      }
    };
    if (draft.id) {
      const q = records.get(draft.id);
      q.onsuccess = () => persist(q.result);
    } else persist();
    tx.oncomplete = () => resolve(record);
    tx.onabort = () =>
      reject(
        reason || new Error("저장하지 못했습니다. 기존 기록은 유지됩니다."),
      );
    tx.onerror = () =>
      reject(
        new Error(
          "저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해주세요.",
        ),
      );
  });
}
export async function initializeRecords(
  seeds: ProjectRecordDraft[],
): Promise<void> {
  const db = await getDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["records", "revisions", "meta"], "readwrite");
    const q = tx.objectStore("meta").get("initialized");
    q.onsuccess = () => {
      if (q.result) return;
      seeds.forEach((d) => {
        const record = makeRecord(d);
        tx.objectStore("records").put(record);
        tx.objectStore("revisions").put(record);
      });
      tx.objectStore("meta").put(true, "initialized");
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function resetProject(seeds: ProjectRecordDraft[]): Promise<void> {
  const db = await getDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(
      ["records", "revisions", "drafts", "meta", "attachments"],
      "readwrite",
    );
    tx.objectStore("records").clear();
    tx.objectStore("revisions").clear();
    tx.objectStore("drafts").clear();
    tx.objectStore("attachments").clear();
    seeds.forEach((d) => {
      const record = makeRecord(d);
      tx.objectStore("records").put(record);
      tx.objectStore("revisions").put(record);
    });
    tx.objectStore("meta").put(true, "initialized");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function exportProject() {
  const records = await listRecords();
  const revisions = (await allRecords("revisions")).filter(
    (r) => r.site_id === SITE.id,
  );
  return {
    schema_version: 1,
    site_id: SITE.id,
    exported_at: new Date().toISOString(),
    records,
    revisions,
    attachments: await archiveAttachments(
      attachmentIds([...records, ...revisions]),
    ),
  };
}
export async function exportRecord(record: ProjectRecord) {
  const revisions = (await listRevisions(record.id)).filter(
    (r) => r.revision <= record.revision,
  );
  return {
    schema_version: 1,
    site_id: SITE.id,
    exported_at: new Date().toISOString(),
    records: [record],
    revisions,
    attachments: await archiveAttachments(
      attachmentIds([record, ...revisions]),
    ),
  };
}
export async function importProject(archive: unknown): Promise<number> {
  const clean = validateArchive(archive);
  const attachments = await decodeArchiveAttachments(clean.attachments);
  const incomingIds = new Set(attachments.map((a) => a.id));
  for (const id of attachmentIds([clean.records, clean.revisions])) {
    if (!incomingIds.has(id) && !(await readAttachment(id)))
      throw new Error("기록에 연결된 첨부파일이 내보내기 자료에 없습니다.");
  }
  const db = await getDatabase();
  let imported = 0;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(
      ["records", "revisions", "attachments"],
      "readwrite",
    );
    let reason: Error | undefined;
    const fail = (message: string) => {
      reason = new Error(message);
      tx.abort();
    };
    for (const attachment of attachments) {
      const q = tx.objectStore("attachments").get(attachment.id);
      q.onsuccess = () => {
        if (
          q.result &&
          (q.result.sha256 !== attachment.sha256 ||
            q.result.name !== attachment.name ||
            q.result.source_id !== attachment.source_id)
        ) {
          fail("동일 첨부 ID의 원본 또는 출처가 다릅니다.");
          return;
        }
        tx.objectStore("attachments").put(attachment);
      };
    }
    const versions = clean.revisions || [];
    const merged = new Map<string, ProjectRecord>();
    [...versions, ...clean.records].forEach((r: ProjectRecord) =>
      merged.set(`${r.id}@${r.revision}`, r),
    );
    for (const record of merged.values()) {
      const q = tx.objectStore("revisions").get([record.id, record.revision]);
      q.onsuccess = () => {
        if (q.result && !sameRevision(q.result, record)) {
          fail(
            "동일한 기록·개정에 서로 다른 내용이 있습니다. 원본을 확인해주세요.",
          );
          return;
        }
        tx.objectStore("revisions").put(record);
      };
    }
    clean.records.forEach((record: ProjectRecord) => {
      const q = tx.objectStore("records").get(record.id);
      q.onsuccess = () => {
        const existing = q.result as ProjectRecord | undefined;
        if (
          existing?.revision === record.revision &&
          !sameRevision(existing, record)
        ) {
          fail("동일 개정의 내용이 다릅니다. 기존 기록을 덮어쓰지 않았습니다.");
          return;
        }
        if (!existing || record.revision > existing.revision) {
          tx.objectStore("records").put(record);
          imported++;
        }
      };
    });
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(
        reason || new Error("가져오기를 취소했습니다. 기존 기록은 유지됩니다."),
      );
    tx.onerror = () =>
      reject(
        reason ||
          tx.error ||
          new Error("가져오기에 실패했습니다. 기존 기록은 유지됩니다."),
      );
  });
  return imported;
}
export async function readDraft<T>(key: string): Promise<T | undefined> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const q = db.transaction("drafts").objectStore("drafts").get(key);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}
export async function writeDraft(key: string, value: unknown): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
