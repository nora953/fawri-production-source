import fs from "node:fs";

const filePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const source = fs.readFileSync(filePath, "utf8");

const sectionStartMarker =
  "// ── Details modal ──────────────────────────────────────────────────────────────";
const sectionEndMarker =
  "// ── Admin logs tab ─────────────────────────────────────────────────────────────";

const sectionStart = source.indexOf(sectionStartMarker);
const sectionEnd = source.indexOf(sectionEndMarker, sectionStart);

if (sectionStart === -1 || sectionEnd === -1 || sectionEnd <= sectionStart) {
  throw new Error("Could not isolate DetailsModal");
}

let detailsSection = source.slice(sectionStart, sectionEnd);

function replaceOnce(label, before, after) {
  if (detailsSection.includes(after)) return;
  const first = detailsSection.indexOf(before);
  if (first === -1) throw new Error(`Could not find ${label}`);
  if (detailsSection.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Found multiple matches for ${label} inside DetailsModal`);
  }
  detailsSection =
    detailsSection.slice(0, first) +
    after +
    detailsSection.slice(first + before.length);
}

replaceOnce(
  "channel definitions",
  `  const channels: Array<{\n    key: string;\n    label: string;\n    icon: React.ComponentType<{ className?: string }>;\n    link?: string;\n    editable: boolean;\n    fixedStatus?: string;\n  }> = [\n    {\n      key: "instagram",\n      label: "Instagram",\n      icon: FaInstagram,\n      link: merchant.instagram_link,\n      editable: true,\n    },\n    {\n      key: "messenger",\n      label: "Messenger",\n      icon: FaFacebookMessenger,\n      link: merchant.messenger_link,\n      editable: true,\n    },\n    {\n      key: "whatsapp",\n      label: "WhatsApp Business",\n      icon: FaWhatsapp,\n      editable: false,\n      fixedStatus: adminText.detailsChannelComingSoon,\n    },\n    {\n      key: "telegram",\n      label: "Telegram",\n      icon: FaTelegram,\n      editable: false,\n      fixedStatus: adminText.detailsChannelInDevelopment,\n    },\n    {\n      key: "tiktok",\n      label: "TikTok",\n      icon: FaTiktok,\n      editable: false,\n      fixedStatus: adminText.detailsChannelInDevelopment,\n    },\n    {\n      key: "web_chat",\n      label: "Web Chat",\n      icon: MessageSquare,\n      editable: false,\n      fixedStatus: adminText.detailsChannelInDevelopment,\n    },\n  ];`,
  `  const channels: Array<{\n    key: string;\n    label: string;\n    icon: React.ComponentType<{ className?: string }>;\n    editable: boolean;\n    fixedStatus?: string;\n  }> = [\n    {\n      key: "instagram",\n      label: "Instagram",\n      icon: FaInstagram,\n      editable: true,\n    },\n    {\n      key: "messenger",\n      label: "Facebook Messenger",\n      icon: FaFacebookMessenger,\n      editable: true,\n    },\n    {\n      key: "whatsapp",\n      label: "WhatsApp Business",\n      icon: FaWhatsapp,\n      editable: false,\n      fixedStatus: adminText.detailsChannelComingSoon,\n    },\n    {\n      key: "web_chat",\n      label: "Web Chat",\n      icon: MessageSquare,\n      editable: false,\n      fixedStatus: adminText.detailsChannelInDevelopment,\n    },\n    {\n      key: "telegram",\n      label: "Telegram",\n      icon: FaTelegram,\n      editable: false,\n      fixedStatus: adminText.detailsChannelInDevelopment,\n    },\n    {\n      key: "tiktok",\n      label: "TikTok",\n      icon: FaTiktok,\n      editable: false,\n      fixedStatus: adminText.detailsChannelInDevelopment,\n    },\n  ];`,
);

replaceOnce(
  "duplicate channels in store details",
  `    [\n      adminText.detailsInstagramLink,\n      merchant.instagram_link || adminText.detailsChannelDisconnected,\n    ],\n    [\n      adminText.detailsMessengerLink,\n      merchant.messenger_link || adminText.detailsChannelDisconnected,\n    ],\n    [\n      adminText.detailsWhatsAppChannel,\n      adminText.detailsChannelComingSoon,\n    ],\n    [\n      adminText.detailsTelegramLink,\n      adminText.detailsChannelInDevelopment,\n    ],\n    [\n      adminText.detailsTikTokChannel,\n      adminText.detailsChannelInDevelopment,\n    ],\n    [\n      adminText.detailsWebChatChannel,\n      adminText.detailsChannelInDevelopment,\n    ],\n`,
  ``,
);

replaceOnce(
  "details body container",
  `        <ScrollArea className="flex-1 px-6 py-4">`,
  `        <div\n          className={\`px-6 py-4 \${\n            activeTab === "channels"\n              ? "flex-none"\n              : "min-h-0 flex-1 overflow-y-auto"\n          }\`}\n        >`,
);

replaceOnce(
  "details body closing tag",
  `        </ScrollArea>`,
  `        </div>`,
);

replaceOnce(
  "store cards alignment",
  `            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">\n              {storeDetails.map(([label, value]) => (\n                <div\n                  key={label}\n                  className="rounded-lg bg-muted/50 p-3"\n                >\n                  <p className="text-xs text-muted-foreground">\n                    {label}\n                  </p>\n\n                  <p className="mt-0.5 break-all text-sm font-medium">\n                    {value}\n                  </p>\n                </div>\n              ))}\n            </div>`,
  `            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">\n              {storeDetails.map(([label, value]) => (\n                <div\n                  key={label}\n                  className={\`flex min-h-20 flex-col justify-center rounded-lg bg-muted/50 p-3 \${textAlignmentClass}\`}\n                >\n                  <p className="text-xs text-muted-foreground">{label}</p>\n\n                  <p className="mt-1 break-all text-sm font-medium">{value}</p>\n                </div>\n              ))}\n            </div>`,
);

replaceOnce(
  "subscription cards alignment",
  `              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">\n                {subscriptionDetails.map(([label, value]) => (\n                  <div\n                    key={label}\n                    className="rounded-lg bg-muted/50 p-3"\n                  >\n                    <p className="text-xs text-muted-foreground">\n                      {label}\n                    </p>\n\n                    <p className="mt-0.5 text-sm font-medium">\n                      {value}\n                    </p>\n                  </div>\n                ))}\n              </div>`,
  `              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">\n                {subscriptionDetails.map(([label, value]) => (\n                  <div\n                    key={label}\n                    className={\`flex min-h-20 flex-col justify-center rounded-lg bg-muted/50 p-3 \${textAlignmentClass}\`}\n                  >\n                    <p className="text-xs text-muted-foreground">{label}</p>\n\n                    <p className="mt-1 text-sm font-medium">{value}</p>\n                  </div>\n                ))}\n              </div>`,
);

const channelsStart = detailsSection.indexOf(
  `          {activeTab === "channels" && (`,
);
const notesStart = detailsSection.indexOf(
  `          {activeTab === "notes" && (`,
  channelsStart,
);

if (channelsStart === -1 || notesStart === -1 || notesStart <= channelsStart) {
  throw new Error("Could not isolate channels tab markup");
}

const channelsMarkup = `          {activeTab === "channels" && (\n            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">\n              {channels.map(({ key, label, icon: Icon, editable, fixedStatus }) => (\n                <div\n                  key={key}\n                  className={\`flex min-h-28 flex-col justify-between gap-3 rounded-lg border p-3 \${textAlignmentClass}\`}\n                >\n                  <div className="flex min-w-0 items-center gap-2">\n                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />\n                    <p className="min-w-0 truncate text-sm font-medium">{label}</p>\n                  </div>\n\n                  {editable ? (\n                    <Select\n                      value={channelOverrides[key] ?? "disconnected"}\n                      onValueChange={(value) =>\n                        onChannelStatusChange(key, value)\n                      }\n                    >\n                      <SelectTrigger className="h-9 w-full text-xs">\n                        <SelectValue />\n                      </SelectTrigger>\n\n                      <SelectContent>\n                        <SelectItem value="connected">\n                          {adminText.detailsChannelConnected}\n                        </SelectItem>\n\n                        <SelectItem value="disconnected">\n                          {adminText.detailsChannelDisconnected}\n                        </SelectItem>\n\n                        <SelectItem value="pending">\n                          {adminText.detailsChannelPending}\n                        </SelectItem>\n                      </SelectContent>\n                    </Select>\n                  ) : (\n                    <span className="inline-flex h-9 w-full items-center justify-center rounded-md border bg-muted px-2 text-center text-xs font-medium text-muted-foreground">\n                      {fixedStatus}\n                    </span>\n                  )}\n                </div>\n              ))}\n            </div>\n          )}\n\n`;

detailsSection =
  detailsSection.slice(0, channelsStart) +
  channelsMarkup +
  detailsSection.slice(notesStart);

replaceOnce(
  "notes alignment",
  `          {activeTab === "notes" && (\n            <div className="space-y-4">\n              <div className="space-y-2">\n                <Label className="block leading-6">\n                  {adminText.detailsInternalNotes}\n                </Label>\n\n                <Textarea\n                  className="min-h-36"\n                  rows={6}\n                  value={noteText}\n                  onChange={(event) =>\n                    setNoteText(event.target.value)\n                  }\n                  placeholder={adminText.detailsNotesPlaceholder}\n                />\n              </div>\n\n              <Button\n                size="sm"\n                onClick={() => {\n                  onSaveNote(noteText);\n                  toast.success(adminText.detailsNotesSaved);\n                }}\n              >\n                {adminText.detailsSaveNotes}\n              </Button>\n            </div>\n          )}`,
  `          {activeTab === "notes" && (\n            <div className={\`space-y-4 \${textAlignmentClass}\`}>\n              <div className="space-y-2">\n                <Label className={\`block leading-6 \${textAlignmentClass}\`}>\n                  {adminText.detailsInternalNotes}\n                </Label>\n\n                <Textarea\n                  className={\`min-h-36 \${textAlignmentClass}\`}\n                  rows={6}\n                  value={noteText}\n                  onChange={(event) =>\n                    setNoteText(event.target.value)\n                  }\n                  placeholder={adminText.detailsNotesPlaceholder}\n                />\n              </div>\n\n              <div className="flex justify-start">\n                <Button\n                  size="sm"\n                  onClick={() => {\n                    onSaveNote(noteText);\n                    toast.success(adminText.detailsNotesSaved);\n                  }}\n                >\n                  {adminText.detailsSaveNotes}\n                </Button>\n              </div>\n            </div>\n          )}`,
);

if (detailsSection.includes(
  `        <div className="flex justify-end border-t px-6 pb-4 pt-4">`,
)) {
  detailsSection = detailsSection.replace(
    `        <div className="flex justify-end border-t px-6 pb-4 pt-4">`,
    `        <div className="flex justify-start border-t px-6 pb-4 pt-4">`,
  );
}

const updatedSource =
  source.slice(0, sectionStart) + detailsSection + source.slice(sectionEnd);
fs.writeFileSync(filePath, updatedSource, "utf8");

const finalSource = fs.readFileSync(filePath, "utf8");
const finalStart = finalSource.indexOf(sectionStartMarker);
const finalEnd = finalSource.indexOf(sectionEndMarker, finalStart);
const finalDetails = finalSource.slice(finalStart, finalEnd);

for (const marker of [
  `grid grid-cols-2 gap-3 sm:grid-cols-3`,
  `label: "Facebook Messenger"`,
  `activeTab === "channels"`,
  `min-h-20 flex-col justify-center`,
  `space-y-4 \${textAlignmentClass}`,
  `flex justify-start border-t`,
]) {
  if (!finalDetails.includes(marker)) {
    throw new Error(`Missing final marker: ${marker}`);
  }
}

for (const forbidden of [
  `adminText.detailsInstagramLink,`,
  `merchant.instagram_link || adminText.detailsChannelDisconnected`,
  `<ScrollArea className="flex-1 px-6 py-4">`,
  `flex justify-end border-t`,
]) {
  if (finalDetails.includes(forbidden)) {
    throw new Error(`Forbidden marker remains: ${forbidden}`);
  }
}

console.log("Merchant details layout refined and channel statuses aligned with landing page.");
