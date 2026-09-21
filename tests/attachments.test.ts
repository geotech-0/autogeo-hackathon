import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { saveAttachment, readAttachment } from "../src/storage/attachments";
import {
  saveRecord,
  exportProject,
  importProject,
  resetProject,
  listRecords,
} from "../src/storage/database";

test("source attachment bytes and provenance survive full archive, reset and import", async () => {
  await resetProject([]);
  const a = await saveAttachment(
    new File(["date,value\n2026-01-03,2.4\n"], "계측원본.csv", {
      type: "text/csv",
    }),
    "monitoring-import-1",
  );
  await saveRecord({
    stage: "construction",
    status: "pending",
    title: "원본 연결",
    summary: "단위 확인 후 검토",
    origin: "measured",
    source_id: "monitoring-import-1",
    payload: { attachment_ids: [a.id] },
  });
  const archive = JSON.parse(JSON.stringify(await exportProject()));
  assert.equal(archive.attachments.length, 1);
  await resetProject([]);
  assert.equal(await readAttachment(a.id), undefined);
  await importProject(archive);
  assert.equal(
    await (await readAttachment(a.id))?.blob.text(),
    "date,value\n2026-01-03,2.4\n",
  );
  assert.equal((await readAttachment(a.id))?.sha256, a.sha256);
  assert.equal((await listRecords())[0].source_id, "monitoring-import-1");
});
test("tampered attachment blocks all record writes and missing attachments cannot be saved", async () => {
  await resetProject([]);
  const a = await saveAttachment(new File(["source"], "조사.txt"));
  const record = await saveRecord({
    stage: "maintenance",
    status: "draft",
    title: "확인조사",
    summary: "원문 첨부",
    payload: { attachment_ids: [a.id] },
  });
  const archive = JSON.parse(JSON.stringify(await exportProject()));
  await resetProject([]);
  archive.attachments[0].base64 = btoa("tamper");
  await assert.rejects(importProject(archive), /SHA-256/);
  assert.equal((await listRecords()).length, 0);
  await assert.rejects(
    saveRecord({ ...record, id: undefined }),
    /첨부파일이 없습니다/,
  );
});
test("previous synthetic site records cannot be relabelled by import", async () => {
  await resetProject([]);
  await assert.rejects(
    importProject({ schema_version: 1, site_id: "synthetic-a", records: [] }),
    /이천자이더리체/,
  );
});
