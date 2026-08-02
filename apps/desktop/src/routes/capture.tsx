import { createFileRoute } from '@tanstack/react-router';

import { CaptureScreen } from '@/features/capture/capture-screen';

export const Route = createFileRoute('/capture')({
  component: CaptureScreen,
});
