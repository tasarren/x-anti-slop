import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { VERSION } from "./version.ts";

type ChromeCredentials = {
  publisherId: string; extensionId: string;
  clientId: string; clientSecret: string; refreshToken: string;
};

export async function publishChrome(credentials: ChromeCredentials, zip: Uint8Array<ArrayBuffer>, request: typeof fetch = fetch): Promise<string> {
  const { publisherId, extensionId, clientId, clientSecret, refreshToken } = credentials;
  if (Object.values(credentials).some(value => !value.trim())) throw new Error("All five Chrome store credentials/IDs are required.");
  async function json(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await request(url, { ...init, signal: AbortSignal.timeout(60_000), redirect: "error" });
    if (!response.ok) throw new Error(`Chrome store request failed (HTTP ${response.status}). Check the developer dashboard; do not blindly resubmit.`);
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Unexpected Chrome store response.");
    return value as Record<string, unknown>;
  }
  const token = await json("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (typeof token["access_token"] !== "string" || !token["access_token"]) throw new Error("No Chrome access token returned.");
  const headers = { Authorization: `Bearer ${token["access_token"]}` };
  const item = `v2/publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}`;
  const upload = await json(`https://chromewebstore.googleapis.com/upload/${item}:upload`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/zip" }, body: zip,
  });
  let state = upload["uploadState"];
  // Google documents both names for the pending state; polling is bounded to five minutes.
  for (let attempt = 0; attempt < 60 && (state === "IN_PROGRESS" || state === "UPLOAD_IN_PROGRESS"); attempt++) {
    await delay(5_000);
    const status = await json(`https://chromewebstore.googleapis.com/${item}:fetchStatus`, { headers });
    state = status["lastAsyncUploadState"];
  }
  if (state !== "SUCCEEDED") throw new Error(`Chrome upload did not succeed (${String(state)}). Nothing was submitted for review.`);
  if (upload["crxVersion"] !== undefined && upload["crxVersion"] !== VERSION) throw new Error("Chrome upload version differs from the release tag.");
  const publication = await json(`https://chromewebstore.googleapis.com/${item}:publish`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ publishType: "DEFAULT_PUBLISH", skipReview: false }),
  });
  if (typeof publication["state"] !== "string" || !["PUBLISHED", "PENDING_REVIEW", "STAGED"].includes(publication["state"])) {
    throw new Error(`Unexpected publication state (${String(publication["state"])}). Check the dashboard before retrying.`);
  }
  return publication["state"];
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const credentials: ChromeCredentials = {
    publisherId: process.env["CHROME_PUBLISHER_ID"] ?? "",
    extensionId: process.env["CHROME_EXTENSION_ID"] ?? "",
    clientId: process.env["CHROME_CLIENT_ID"] ?? "",
    clientSecret: process.env["CHROME_CLIENT_SECRET"] ?? "",
    refreshToken: process.env["CHROME_REFRESH_TOKEN"] ?? "",
  };
  const zip = new Uint8Array(await readFile(`artifacts/x-anti-slop-${VERSION}-chromium.zip`));
  console.log(`Chrome submission state: ${await publishChrome(credentials, zip)}. Store review is separate from this workflow.`);
}
