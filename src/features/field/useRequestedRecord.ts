import { useEffect, useRef } from "react";
import type { ProjectRecord } from "../../contracts";
/** Apply a requested history entry once, after local draft hydration. Record refreshes never overwrite edits. */
export function useRequestedRecord(
  id: string | null | undefined,
  records: ProjectRecord[],
  ready: boolean,
  apply: (record: ProjectRecord) => void,
) {
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!id) {
      handled.current = null;
      return;
    }
    if (!ready || handled.current === id) return;
    const record = records.find((r) => r.id === id);
    if (!record) return;
    handled.current = id;
    apply(record);
  }, [id, records, ready, apply]);
}
