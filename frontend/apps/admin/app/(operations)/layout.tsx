import { OperationsShell } from "@/features/session/operations-shell";
import { ToastProvider } from "@vsolve/ui";

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <OperationsShell>
        {children}
      </OperationsShell>
    </ToastProvider>
  );
}
