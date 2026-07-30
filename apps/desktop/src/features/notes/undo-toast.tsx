import { toast } from '@/components/ui/toast';

export function createUndoHandler(
  action: () => void | Promise<void>,
  onComplete?: () => void,
): () => void {
  let running = false;
  return () => {
    if (running) return;
    running = true;
    void Promise.resolve(action())
      .finally(onComplete)
      .catch(() => undefined);
  };
}

export function showUndoToast({
  title,
  description,
  undoLabel,
  onUndo,
}: {
  title: string;
  description: string;
  undoLabel: string;
  onUndo(): void | Promise<void>;
}): string {
  let id = '';
  const undo = createUndoHandler(onUndo, () => toast.close(id));
  id = toast.add({
    title,
    description,
    type: 'success',
    timeout: 10_000,
    actionProps: { children: undoLabel, onClick: undo },
  });
  return id;
}
