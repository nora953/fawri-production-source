import { useI18n } from '@/lib/i18n';
import { COMMON_UI_COPY, COMMON_UI_LABELS } from '@/lib/translations/commonUi';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type ServerChannelSummary = {
  id: string;
  platform: "messenger" | "instagram";
  page_id: string;
  page_name: string;
  status: "connecting" | "active" | "disconnecting" | "disconnected" | "error";
  webhook_subscribed: boolean;
  credential_configured: boolean;
  connection_version: number;
  updated_at: string;
  last_error_code?: string;
};

export function ChannelStatusCard(props: {
  channel: ServerChannelSummary;
  busy: boolean;
  onDisconnect(channel: ServerChannelSummary): void;
}) {
  const { channel, busy, onDisconnect } = props;
  const { lang } = useI18n();
  const commonCopy = COMMON_UI_COPY[lang];
  const canDisconnect = channel.status === "active" || channel.status === "error";

  return (
    <article className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {channel.platform}
          </p>
          <h2 className="mt-1 text-2xl font-black text-foreground">
            {channel.page_name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{channel.page_id}</p>
        </div>
        <Badge variant={channel.status === "active" ? "default" : "secondary"}>
          {channel.status}
        </Badge>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-muted/50 p-3">
          <dt className="text-muted-foreground">{COMMON_UI_LABELS.technical.webhook}</dt>
          <dd className="mt-1 font-bold">
            {channel.webhook_subscribed ? commonCopy.channelSubscribed : commonCopy.channelNotSubscribed}
          </dd>
        </div>
        <div className="rounded-2xl bg-muted/50 p-3">
          <dt className="text-muted-foreground">{COMMON_UI_LABELS.technical.encryptedToken}</dt>
          <dd className="mt-1 font-bold">
            {channel.credential_configured ? commonCopy.credentialConfigured : commonCopy.credentialRemoved}
          </dd>
        </div>
      </dl>

      {channel.last_error_code ? (
        <p className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm font-semibold text-destructive">
          {channel.last_error_code}
        </p>
      ) : null}

      <Button
        type="button"
        variant="destructive"
        className="mt-5 w-full rounded-2xl"
        disabled={!canDisconnect || busy}
        onClick={() => onDisconnect(channel)}
      >
        {busy || channel.status === "disconnecting"
          ? commonCopy.disconnectingChannel
          : commonCopy.disconnectChannel}
      </Button>
    </article>
  );
}
