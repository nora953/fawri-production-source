import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { SERVER_SAVED_ANSWERS_PAGE_COPY } from "@/lib/translations/features/pages/dashboard/ServerSavedAnswersPage";

type Language = "ar" | "ku" | "en";
type Tone = "professional" | "friendly" | "warm" | "direct";
type Brevity = "concise" | "balanced" | "detailed";
type EmojiStyle = "none" | "minimal" | "expressive";

type ResponseStyle = {
  version: number;
  tone: Tone;
  brevity: Brevity;
  emojiStyle: EmojiStyle;
  customInstructions: string;
  updatedAt: string | null;
};

function isResponseStyle(value: unknown): value is ResponseStyle {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const style = value as Record<string, unknown>;
  return (
    typeof style.version === "number" &&
    Number.isInteger(style.version) &&
    style.version > 0 &&
    (style.tone === "professional" ||
      style.tone === "friendly" ||
      style.tone === "warm" ||
      style.tone === "direct") &&
    (style.brevity === "concise" ||
      style.brevity === "balanced" ||
      style.brevity === "detailed") &&
    (style.emojiStyle === "none" ||
      style.emojiStyle === "minimal" ||
      style.emojiStyle === "expressive") &&
    typeof style.customInstructions === "string" &&
    (style.updatedAt === null || typeof style.updatedAt === "string")
  );
}

export function MerchantResponseStyleCard() {
  const { lang } = useI18n();
  const language: Language = lang === "ku" || lang === "en" ? lang : "ar";
  const copy = SERVER_SAVED_ANSWERS_PAGE_COPY[language];
  const [current, setCurrent] = useState<ResponseStyle | null>(null);
  const [draft, setDraft] = useState<ResponseStyle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(
    () => Boolean(current && draft && JSON.stringify(current) !== JSON.stringify(draft)),
    [current, draft],
  );

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/knowledge/response-style", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true || !isResponseStyle(body.style)) {
        throw new Error(body?.error || copy.styleLoadFailed);
      }
      setCurrent(body.style);
      setDraft(structuredClone(body.style));
      return true;
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : copy.styleLoadFailed);
      }
      return false;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [copy.styleLoadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!current || !draft || !dirty || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/knowledge/response-style", {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: current.version,
          style: {
            tone: draft.tone,
            brevity: draft.brevity,
            emojiStyle: draft.emojiStyle,
            customInstructions: draft.customInstructions,
          },
        }),
      });
      const body = await response.json().catch(() => null);
      if (
        response.status === 409 &&
        body?.code === "MERCHANT_RESPONSE_STYLE_VERSION_CONFLICT" &&
        isResponseStyle(body.current)
      ) {
        setCurrent(body.current);
        setDraft(structuredClone(body.current));
        toast.error(copy.styleConflict);
        return;
      }
      if (!response.ok || body?.ok !== true || !isResponseStyle(body.style)) {
        throw new Error(body?.error || copy.styleSaveFailed);
      }
      setCurrent(body.style);
      setDraft(structuredClone(body.style));
      toast.success(copy.styleSaved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.styleSaveFailed);
      await load(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.styleTitle}</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.styleDescription}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {copy.loading}
          </div>
        ) : draft ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-2 text-sm font-semibold">
                <span>{copy.styleTone}</span>
                <select
                  value={draft.tone}
                  onChange={(event) =>
                    setDraft((value) =>
                      value
                        ? { ...value, tone: event.target.value as Tone }
                        : value,
                    )
                  }
                  className="h-11 w-full rounded-md border bg-background px-3"
                  disabled={saving}
                >
                  <option value="professional">{copy.styleToneProfessional}</option>
                  <option value="friendly">{copy.styleToneFriendly}</option>
                  <option value="warm">{copy.styleToneWarm}</option>
                  <option value="direct">{copy.styleToneDirect}</option>
                </select>
              </label>

              <label className="space-y-2 text-sm font-semibold">
                <span>{copy.styleBrevity}</span>
                <select
                  value={draft.brevity}
                  onChange={(event) =>
                    setDraft((value) =>
                      value
                        ? { ...value, brevity: event.target.value as Brevity }
                        : value,
                    )
                  }
                  className="h-11 w-full rounded-md border bg-background px-3"
                  disabled={saving}
                >
                  <option value="concise">{copy.styleBrevityConcise}</option>
                  <option value="balanced">{copy.styleBrevityBalanced}</option>
                  <option value="detailed">{copy.styleBrevityDetailed}</option>
                </select>
              </label>

              <label className="space-y-2 text-sm font-semibold">
                <span>{copy.styleEmoji}</span>
                <select
                  value={draft.emojiStyle}
                  onChange={(event) =>
                    setDraft((value) =>
                      value
                        ? { ...value, emojiStyle: event.target.value as EmojiStyle }
                        : value,
                    )
                  }
                  className="h-11 w-full rounded-md border bg-background px-3"
                  disabled={saving}
                >
                  <option value="none">{copy.styleEmojiNone}</option>
                  <option value="minimal">{copy.styleEmojiMinimal}</option>
                  <option value="expressive">{copy.styleEmojiExpressive}</option>
                </select>
              </label>
            </div>

            <label className="block space-y-2 text-sm font-semibold">
              <span>{copy.styleInstructions}</span>
              <Textarea
                value={draft.customInstructions}
                onChange={(event) =>
                  setDraft((value) =>
                    value
                      ? {
                          ...value,
                          customInstructions: event.target.value.slice(0, 800),
                        }
                      : value,
                  )
                }
                rows={3}
                maxLength={800}
                placeholder={copy.styleInstructionsPlaceholder}
                disabled={saving}
              />
            </label>

            <p className="rounded-xl border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
              {copy.styleSafety}
            </p>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void save()}
                disabled={!dirty || saving}
              >
                {saving ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="me-2 h-4 w-4" />
                )}
                {saving ? copy.styleSaving : copy.styleSave}
              </Button>
            </div>
          </>
        ) : (
          <div className="text-sm text-destructive">{copy.styleLoadFailed}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default MerchantResponseStyleCard;
