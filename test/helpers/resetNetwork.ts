import { networkHelpers } from "./hh";

type SnapshotHandle = Awaited<ReturnType<typeof networkHelpers.takeSnapshot>>;

let fileBaseline: SnapshotHandle | undefined;

/** Restore prior snapshot (if any), then snapshot. Isolates chain state between test files. */
export async function resetNetwork(): Promise<void> {
  if (fileBaseline !== undefined) {
    await fileBaseline.restore();
  }
  fileBaseline = await networkHelpers.takeSnapshot();
}
