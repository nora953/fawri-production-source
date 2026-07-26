import fs from "node:fs";

const adminPagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const translationsPath = "artifacts/fawri/src/lib/admin-translations.ts";

function replaceOnce(source, label, before, after) {
  if (source.includes(after)) return source;
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Found multiple matches for ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let adminPage = fs.readFileSync(adminPagePath, "utf8");

adminPage = replaceOnce(
  adminPage,
  "channel icon imports",
  `  FileText,\n} from "lucide-react";\nimport { FaInstagram, FaFacebookMessenger, FaTelegram } from "react-icons/fa";`,
  `  FileText,\n  MessageSquare,\n} from "lucide-react";\nimport {\n  FaInstagram,\n  FaFacebookMessenger,\n  FaTelegram,\n  FaWhatsapp,\n  FaTiktok,\n} from "react-icons/fa";`,
);

adminPage = replaceOnce(
  adminPage,
  "details channels definition",
  `  const channels = [\n    {\n      key: "instagram",\n      label: "Instagram",\n      icon: FaInstagram,\n      link: merchant.instagram_link,\n    },\n    {\n      key: "messenger",\n      label: "Messenger",\n      icon: FaFacebookMessenger,\n      link: merchant.messenger_link,\n    },\n    {\n      key: "telegram",\n      label: "Telegram",\n      icon: FaTelegram,\n      link: merchant.telegram_link,\n    },\n  ];`,
  `  const channels: Array<{\n    key: string;\n    label: string;\n    icon: React.ComponentType<{ className?: string }>;\n    link?: string;\n    editable: boolean;\n    fixedStatus?: string;\n  }> = [\n    {\n      key: "instagram",\n      label: "Instagram",\n      icon: FaInstagram,\n      link: merchant.instagram_link,\n      editable: true,\n    },\n    {\n      key: "messenger",\n      label: "Messenger",\n      icon: FaFacebookMessenger,\n      link: merchant.messenger_link,\n      editable: true,\n    },\n    {\n      key: "whatsapp",\n      label: "WhatsApp Business",\n      icon: FaWhatsapp,\n      editable: false,\n      fixedStatus: adminText.detailsChannelComingSoon,\n    },\n    {\n      key: "telegram",\n      label: "Telegram",\n      icon: FaTelegram,\n      editable: false,\n      fixedStatus: adminText.detailsChannelInDevelopment,\n    },\n    {\n      key: "tiktok",\n      label: "TikTok",\n      icon: FaTiktok,\n      editable: false,\n      fixedStatus: adminText.detailsChannelInDevelopment,\n    },\n    {\n      key: "web_chat",\n      label: "Web Chat",\n      icon: MessageSquare,\n      editable: false,\n      fixedStatus: adminText.detailsChannelInDevelopment,\n    },\n  ];`,
);

adminPage = replaceOnce(
  adminPage,
  "store channel details",
  `    [\n      adminText.detailsInstagramLink,\n      merchant.instagram_link || "—",\n    ],\n    [\n      adminText.detailsMessengerLink,\n      merchant.messenger_link || "—",\n    ],\n    [\n      adminText.detailsTelegramLink,\n      merchant.telegram_link || "—",\n    ],`,
  `    [\n      adminText.detailsInstagramLink,\n      merchant.instagram_link || adminText.detailsChannelDisconnected,\n    ],\n    [\n      adminText.detailsMessengerLink,\n      merchant.messenger_link || adminText.detailsChannelDisconnected,\n    ],\n    [\n      adminText.detailsWhatsAppChannel,\n      adminText.detailsChannelComingSoon,\n    ],\n    [\n      adminText.detailsTelegramLink,\n      adminText.detailsChannelInDevelopment,\n    ],\n    [\n      adminText.detailsTikTokChannel,\n      adminText.detailsChannelInDevelopment,\n    ],\n    [\n      adminText.detailsWebChatChannel,\n      adminText.detailsChannelInDevelopment,\n    ],`,
);

adminPage = replaceOnce(
  adminPage,
  "channels tab cards",
  `              {channels.map(\n                ({ key, label, icon: Icon, link }) => (\n                  <div\n                    key={key}\n                    className="flex items-center gap-3 rounded-lg border p-3"\n                  >\n                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />\n\n                    <div className="min-w-0 flex-1">\n                      <p className="text-sm font-medium">\n                        {label}\n                      </p>\n\n                      {link ? (\n                        <p className="truncate text-xs text-muted-foreground">\n                          {link}\n                        </p>\n                      ) : (\n                        <p className="text-xs text-muted-foreground">\n                          {adminText.detailsNoLink}\n                        </p>\n                      )}\n                    </div>\n\n                    <Select\n                      value={\n                        channelOverrides[key] ??\n                        "disconnected"\n                      }\n                      onValueChange={(value) =>\n                        onChannelStatusChange(key, value)\n                      }\n                    >\n                      <SelectTrigger className="h-8 w-36 text-xs">\n                        <SelectValue />\n                      </SelectTrigger>\n\n                      <SelectContent>\n                        <SelectItem value="connected">\n                          {adminText.detailsChannelConnected}\n                        </SelectItem>\n\n                        <SelectItem value="disconnected">\n                          {adminText.detailsChannelDisconnected}\n                        </SelectItem>\n\n                        <SelectItem value="pending">\n                          {adminText.detailsChannelPending}\n                        </SelectItem>\n                      </SelectContent>\n                    </Select>\n                  </div>\n                ),\n              )}`,
  `              {channels.map(\n                ({ key, label, icon: Icon, link, editable, fixedStatus }) => (\n                  <div\n                    key={key}\n                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"\n                  >\n                    <div className="flex min-w-0 flex-1 items-center gap-3">\n                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />\n\n                      <div className="min-w-0 flex-1">\n                        <p className="text-sm font-medium">{label}</p>\n\n                        {editable && (\n                          link ? (\n                            <p className="truncate text-xs text-muted-foreground">\n                              {link}\n                            </p>\n                          ) : (\n                            <p className="text-xs text-muted-foreground">\n                              {adminText.detailsNoLink}\n                            </p>\n                          )\n                        )}\n                      </div>\n                    </div>\n\n                    {editable ? (\n                      <Select\n                        value={channelOverrides[key] ?? "disconnected"}\n                        onValueChange={(value) =>\n                          onChannelStatusChange(key, value)\n                        }\n                      >\n                        <SelectTrigger className="h-8 w-full text-xs sm:w-36">\n                          <SelectValue />\n                        </SelectTrigger>\n\n                        <SelectContent>\n                          <SelectItem value="connected">\n                            {adminText.detailsChannelConnected}\n                          </SelectItem>\n\n                          <SelectItem value="disconnected">\n                            {adminText.detailsChannelDisconnected}\n                          </SelectItem>\n\n                          <SelectItem value="pending">\n                            {adminText.detailsChannelPending}\n                          </SelectItem>\n                        </SelectContent>\n                      </Select>\n                    ) : (\n                      <span className="inline-flex h-8 w-full items-center justify-center rounded-md border bg-muted px-3 text-xs font-medium text-muted-foreground sm:w-auto">\n                        {fixedStatus}\n                      </span>\n                    )}\n                  </div>\n                ),\n              )}`,
);

adminPage = replaceOnce(
  adminPage,
  "notes field spacing",
  `          {activeTab === "notes" && (\n            <div className="space-y-3">\n              <Label>{adminText.detailsInternalNotes}</Label>\n\n              <Textarea\n                rows={6}\n                value={noteText}\n                onChange={(event) =>\n                  setNoteText(event.target.value)\n                }\n                placeholder={adminText.detailsNotesPlaceholder}\n              />\n\n              <Button`,
  `          {activeTab === "notes" && (\n            <div className="space-y-4">\n              <div className="space-y-2">\n                <Label className="block leading-6">\n                  {adminText.detailsInternalNotes}\n                </Label>\n\n                <Textarea\n                  className="min-h-36"\n                  rows={6}\n                  value={noteText}\n                  onChange={(event) =>\n                    setNoteText(event.target.value)\n                  }\n                  placeholder={adminText.detailsNotesPlaceholder}\n                />\n              </div>\n\n              <Button`,
);

fs.writeFileSync(adminPagePath, adminPage, "utf8");

let translations = fs.readFileSync(translationsPath, "utf8");

translations = replaceOnce(
  translations,
  "Arabic channel labels and statuses",
  `    detailsInstagramLink: "رابط Instagram",\n    detailsMessengerLink: "رابط Messenger",\n    detailsTelegramLink: "رابط Telegram",`,
  `    detailsInstagramLink: "Instagram",\n    detailsMessengerLink: "Messenger",\n    detailsWhatsAppChannel: "WhatsApp Business",\n    detailsTelegramLink: "Telegram",\n    detailsTikTokChannel: "TikTok",\n    detailsWebChatChannel: "Web Chat",`,
);
translations = replaceOnce(
  translations,
  "Arabic future channel statuses",
  `    detailsChannelPending: "قيد الربط",`,
  `    detailsChannelPending: "قيد الربط",\n    detailsChannelComingSoon: "قريبًا",\n    detailsChannelInDevelopment: "قيد التطوير",`,
);

translations = replaceOnce(
  translations,
  "English channel labels and statuses",
  `    detailsInstagramLink: "Instagram link",\n    detailsMessengerLink: "Messenger link",\n    detailsTelegramLink: "Telegram link",`,
  `    detailsInstagramLink: "Instagram",\n    detailsMessengerLink: "Messenger",\n    detailsWhatsAppChannel: "WhatsApp Business",\n    detailsTelegramLink: "Telegram",\n    detailsTikTokChannel: "TikTok",\n    detailsWebChatChannel: "Web Chat",`,
);
translations = replaceOnce(
  translations,
  "English future channel statuses",
  `    detailsChannelPending: "Connection pending",`,
  `    detailsChannelPending: "Connection pending",\n    detailsChannelComingSoon: "Coming soon",\n    detailsChannelInDevelopment: "In development",`,
);

translations = replaceOnce(
  translations,
  "Kurdish channel labels and statuses",
  `  detailsInstagramLink: "لینکی Instagram",\n  detailsMessengerLink: "لینکی Messenger",\n  detailsTelegramLink: "لینکی Telegram",`,
  `  detailsInstagramLink: "Instagram",\n  detailsMessengerLink: "Messenger",\n  detailsWhatsAppChannel: "WhatsApp Business",\n  detailsTelegramLink: "Telegram",\n  detailsTikTokChannel: "TikTok",\n  detailsWebChatChannel: "Web Chat",`,
);
translations = replaceOnce(
  translations,
  "Kurdish future channel statuses",
  `  detailsChannelPending: "چاوەڕوان",`,
  `  detailsChannelPending: "چاوەڕوان",\n  detailsChannelComingSoon: "بەم زووانە",\n  detailsChannelInDevelopment: "لە ژێر پەرەپێدان",`,
);

fs.writeFileSync(translationsPath, translations, "utf8");

const finalAdminPage = fs.readFileSync(adminPagePath, "utf8");
const finalTranslations = fs.readFileSync(translationsPath, "utf8");

for (const marker of [
  `key: "whatsapp"`,
  `key: "tiktok"`,
  `key: "web_chat"`,
  `detailsWhatsAppChannel`,
  `detailsChannelInDevelopment`,
  `className="block leading-6"`,
  `className="min-h-36"`,
]) {
  if (!finalAdminPage.includes(marker) && !finalTranslations.includes(marker)) {
    throw new Error(`Missing final marker: ${marker}`);
  }
}

console.log("Merchant details store, channels, and notes sections completed.");
