import { IconRestore, IconTrashX } from '@tabler/icons-react';
import { AnimatePresence, m as motion } from 'motion/react';
import { useEffect, useState } from 'react';

import { useMessages } from '@/app/providers';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { motionProfiles } from '@/motion/system';

export function BulkTrashDialog({
  count,
  context,
  open,
  onOpenChange,
  onConfirm,
}: {
  count: number;
  context: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onConfirm(): Promise<void>;
}) {
  const m = useMessages();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (open) {
      setBusy(false);
      setError(false);
    }
  }, [open]);
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.trash_confirm_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {count === 1
              ? m.trash_confirm_one({ context })
              : m.trash_confirm_many({ count, context })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {error ? <p role="alert">{m.trash_confirm_error()}</p> : null}
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } catch {
                setError(true);
              } finally {
                setBusy(false);
              }
            }}
            variant="destructive"
          >
            {m.trash_confirm_action()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function TrashView({
  count,
  onRestore,
  onPermanentlyDelete,
}: {
  count: number;
  onRestore(): Promise<void>;
  onPermanentlyDelete(): Promise<void>;
}) {
  const m = useMessages();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoreError, setRestoreError] = useState(false);
  const [permanentError, setPermanentError] = useState(false);
  useEffect(() => {
    if (confirmOpen) setPermanentError(false);
  }, [confirmOpen]);
  return (
    <>
      <AnimatePresence initial={false}>
        {count > 0 ? (
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="selection-bar transient-material"
            exit={{ opacity: 0, x: 'var(--motion-surface-distance)' }}
            initial={{ opacity: 0, x: 'var(--motion-surface-distance)' }}
            transition={motionProfiles.surface}
          >
            <strong>
              {count === 1 ? m.selection_count_one() : m.selection_count_many({ count })}
            </strong>
            <Button
              onClick={() => {
                setRestoreError(false);
                void onRestore().catch(() => setRestoreError(true));
              }}
              size="sm"
              variant="ghost"
            >
              <IconRestore data-icon="inline-start" />
              {m.trash_restore()}
            </Button>
            <Button
              disabled={count !== 1}
              onClick={() => setConfirmOpen(true)}
              size="sm"
              title={count !== 1 ? m.trash_permanent_single_only() : undefined}
              variant="destructive"
            >
              <IconTrashX data-icon="inline-start" />
              {m.trash_permanent()}
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {restoreError ? <p role="alert">{m.trash_restore_error()}</p> : null}
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.trash_permanent_title()}</AlertDialogTitle>
            <AlertDialogDescription>{m.trash_permanent_description()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {permanentError ? <p role="alert">{m.trash_permanent_error()}</p> : null}
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setPermanentError(false);
                try {
                  await onPermanentlyDelete();
                  setConfirmOpen(false);
                } catch {
                  setPermanentError(true);
                }
              }}
              variant="destructive"
            >
              {m.trash_permanent_confirm()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
