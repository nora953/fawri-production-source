import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ChannelStatusCard,
  type ServerChannelSummary,
} from "@/components/channels/ChannelStatusCard";

type ChannelsResponse = {
  ok: boolean;
  channels?: ServerChannelSummary[];
  error?: string;
};

async function readJson(response: Response): Promise<ChannelsResponse> {
  return response.json().catch(() => ({ ok: false, error: "Invalid server response" }));
}

export default function ServerChannelsPage() {
  const [channels, setChannels] = useState<ServerChannelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyChannel, setBusyChannel] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/channels", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const body = await readJson(response);
      if (!response.ok || !body.ok) {
        throw new Error(body.error || "Channels are unavailable");
      }
      setChannels(Array.isArray(body.channels) ? body.channels : []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Channels are unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const disconnect = async (channel: ServerChannelSummary) => {
    setBusyChannel(channel.id);
    setError("");
    try {
      const response = await fetch(
        `/api/channels/meta/${encodeURIComponent(channel.platform)}/${encodeURIComponent(channel.page_id)}/disconnect`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ expected_version: channel.connection_version }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true) {
        throw new Error(body?.error || "Channel disconnect could not be queued");
      }
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Channel disconnect could not be queued",
      );
    } finally {
      setBusyChannel("");
    }
  };

  return (
    <main className="min-h-screen bg-background p-4 pb-24" dir="auto">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-4xl font-black tracking-tight">Connected channels</h1>
            <p className="mt-2 text-muted-foreground">
              Server-authoritative connection status. Access tokens are never shown here.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </Button>
        </header>

        {error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 font-semibold text-destructive">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border bg-card p-8 text-center text-muted-foreground">
            Loading channels…
          </div>
        ) : channels.length === 0 ? (
          <div className="rounded-3xl border bg-card p-8 text-center">
            <h2 className="text-xl font-black">No connected channels</h2>
            <p className="mt-2 text-muted-foreground">
              Complete the approved Meta OAuth flow to connect Messenger or Instagram.
            </p>
          </div>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {channels.map((channel) => (
              <ChannelStatusCard
                key={channel.id}
                channel={channel}
                busy={busyChannel === channel.id}
                onDisconnect={(item) => void disconnect(item)}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
