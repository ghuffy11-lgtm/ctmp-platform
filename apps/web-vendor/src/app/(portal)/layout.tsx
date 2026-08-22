import { PortalShell } from '@/components/layout/PortalShell';
import { DialogProvider } from '@/components/dialog/DialogProvider';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <DialogProvider>
      <PortalShell>{children}</PortalShell>
    </DialogProvider>
  );
}
