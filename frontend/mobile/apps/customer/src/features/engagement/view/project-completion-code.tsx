// Ported from frontend/apps/customer/features/engagement/view/project-completion-code.tsx
import { describeError } from "@vsolve/query/native";
import { Badge, Button, Card, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import { useIssueProjectCompletionCode, useProjectCompletionCode } from "@/features/engagement/queries";

const TERMINAL = new Set(["COMPLETED", "WARRANTY", "CLOSED"]);

export function ProjectCompletionCodePanel({
  engagementId,
  status,
}: {
  readonly engagementId: string;
  readonly status: string;
}) {
  const [requestedReveal, setRequestedReveal] = useState(false);
  const codeQuery = useProjectCompletionCode(engagementId, !TERMINAL.has(status));
  const issue = useIssueProjectCompletionCode(engagementId);
  const code = codeQuery.data?.code ?? null;
  const revealed = requestedReveal || code !== null;

  if (TERMINAL.has(status)) {
    return (
      <Card className="mt-6 border-success-line bg-success-surface p-4">
        <Text className="font-semibold text-success-text">Project completed</Text>
        <Text className="text-sm text-success-text">The completion code was verified.</Text>
      </Card>
    );
  }

  return (
    <View className="mt-6">
      <Card padding="none" className="overflow-hidden border-action/20">
        <View className="bg-action-soft p-4">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-semibold text-text">Finish the project safely</Text>
            <Badge tone="info">Your approval</Badge>
          </View>
          <Text className="mt-1 text-sm leading-6 text-text-secondary">
            Check every agreed item first. Share this code only when the whole project is finished; the Partner entering it approves every stage and closes the project.
          </Text>
        </View>
        <View className="p-4">
          {codeQuery.isPending ? <Skeleton className="h-12 w-full" /> : null}
          {codeQuery.isError ? (
            <ErrorState
              title={describeError(codeQuery.error, "read").title}
              message={describeError(codeQuery.error, "read").message}
              severity={describeError(codeQuery.error, "read").severity}
              inline
            />
          ) : null}
          {!codeQuery.isPending && !codeQuery.isError && !codeQuery.data?.can_issue ? (
            <Text className="text-sm leading-6 text-text-secondary">
              The code becomes available after every agreed stage is funded and any open issue is resolved.
            </Text>
          ) : null}
          {codeQuery.data?.can_issue && (!revealed || code === null) ? (
            <Button
              onPress={() => issue.mutate(undefined, { onSuccess: () => setRequestedReveal(true) })}
              loading={issue.isPending}
              loadingLabel="Creating code"
            >
              Show completion code
            </Button>
          ) : null}
          {revealed && code !== null ? (
            <View className="rounded-card border border-line bg-canvas p-4">
              <Text className="text-center text-xs font-semibold uppercase tracking-wide text-text-muted">
                Give this code to the Partner
              </Text>
              <Text className="mt-2 text-center text-3xl font-extrabold tracking-[0.35em] text-text">{code}</Text>
              {codeQuery.data?.expires_at ? (
                <Text className="mt-2 text-center text-xs text-text-muted">
                  Expires {new Date(codeQuery.data.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </Text>
              ) : null}
            </View>
          ) : null}
          {issue.isError ? (
            <View className="mt-3">
              <ErrorState
                title={describeError(issue.error, "mutation").title}
                message={describeError(issue.error, "mutation").message}
                severity={describeError(issue.error, "mutation").severity}
                inline
              />
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}
