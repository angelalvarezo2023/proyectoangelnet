// app/api/bump-all/route.ts
// Called by GitHub Actions cron every 20 minutes
// Bumps posts for all active users using their saved session cookies

import https from "https";
import http from "http";
import { HttpsProxyAgent } from "https-proxy-agent";

const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";
export const runtime = "nodejs";
export const maxDuration = 60;

const BUMP_SECRET = process.env.BUMP_SECRET || "angel-rent-secret-2024";

interface ProxyUser {
  name?: string; proxyHost?: string; proxyPort?: string;
  proxyUser?: string; proxyPass?: string; userAgentKey?: string; userAgent?: string;
  rentalEnd?: string; active?: boolean; cookies?: string; cookieTs?: number;
  robotEnabled?: boolean;
}

interface BumpResult {
  user: string;
  success: boolean;
  message: string;
  postsFound: number;
  bumped: number;
}

export async function GET(req: Request) {
  // Verify secret to prevent unauthorized calls
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== BUMP_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const results: BumpResult[] = [];

  try {
    // Get all users from Firebase
    const users = await getAllUsers();
    if (!users) return jsonRes({ ok: true, results: [], message: "No users found" });

    const now = new Date();

    for (const [username, user] of Object.entries(users)) {
      // Skip inactive users
      if (!user.active) continue;
      // Skip expired rentals
      if (user.rentalEnd && now > new Date(user.rentalEnd + "T23:59:59")) continue;
      // Skip if client has robot OFF (robotOn === false explicitly set)
      if (user.robotOn === false) {
        // Don't add to results — robot is intentionally off, not an error
        continue;
      }
      // Skip if paused (client paused or admin paused)
      if (user.robotPaused === true) {
        results.push({ user: username, success: false, message: "⏸ Pausado", postsFound: 0, bumped: 0 });
        continue;
      }
      // Skip if no cookies saved
      if (!user.cookies) {
        results.push({ user: username, success: false, message: "No hay cookies guardadas - el cliente debe abrir el proxy primero", postsFound: 0, bumped: 0 });
        continue;
      }
      // Skip if cookies are older than 7 days
      if (user.cookieTs && (Date.now() - user.cookieTs) > 7 * 24 * 3600 * 1000) {
        results.push({ user: username, success: false, message: "Cookies expiradas - el cliente debe abrir el proxy", postsFound: 0, bumped: 0 });
        continue;
      }

      const result = await bumpUser(username, user);
      results.push(result);

      // Small delay between users to avoid hammering
      await sleep(2000);
    }

    return jsonRes({ ok: true, ts: new Date().toISOString(), results });
  } catch (err: any) {
    return jsonRes({ ok: false, error: err.message }, 500);
  }
}

async function bumpUser(username: string, user: ProxyUser): Promise<BumpResult> {
  const { proxyHost: PH = "", proxyPort: PT = "", proxyUser: PU = "", proxyPass: PP = "" } = user;
  if (!PH || !PT) return { user: username, success: false, message: "Proxy no configurado", postsFound: 0, bumped: 0 };

  const proxyUrl = PU && PP ? `http://${PU}:${PP}@${PH}:${PT}` : `http://${PH}:${PT}`;
  const agent = new HttpsProxyAgent(proxyUrl);
  const ua = getUA(user);
  const cookies = user.cookies || "";

  try {
    // Step 1: Get post list to find post IDs
    const listResp = await fetchDirect("https://megapersonals.eu/users/posts/list", agent, cookies, ua);
    if (!listResp.ok) {
      // Try to detect session expired
      if (listResp.body.includes("login") || listResp.body.includes("sign_in")) {
        return { user: username, success: false, message: "Sesión expirada - el cliente debe abrir el proxy para renovar", postsFound: 0, bumped: 0 };
      }
      return { user: username, success: false, message: `Error cargando lista: HTTP ${listResp.status}`, postsFound: 0, bumped: 0 };
    }

    // Extract post IDs from HTML
    const postIds = extractPostIds(listResp.body);
    if (!postIds.length) {
      return { user: username, success: false, message: "No se encontraron posts en la lista", postsFound: 0, bumped: 0 };
    }

    // Auto-extract phone number from page and save to Firebase
    const phoneMatch = listResp.body.match(/\b(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/);
    if (phoneMatch) {
      mergeCookies(username, [], cookies); // keep cookies fresh
      fbPatch(username, { phoneNumber: phoneMatch[0].trim() }).catch(() => {});
    }

    // Step 2: Bump each post
    let bumped = 0;
    for (const pid of postIds) {
      try {
        const bumpResp = await fetchDirect(
          `https://megapersonals.eu/users/posts/bump/${pid}`,
          agent, cookies, ua, "GET",
          `https://megapersonals.eu/users/posts/list`
        );
        if (bumpResp.ok && !bumpResp.body.includes("blocked") && !bumpResp.body.includes("Attention Required")) {
          bumped++;
          // Update cookies if new ones came back
          if (bumpResp.newCookies.length) {
            await mergeCookies(username, bumpResp.newCookies, cookies);
          }
        }
        if (postIds.length > 1) await sleep(1500);
      } catch (e) { /* continue with next post */ }
    }

    return { user: username, success: bumped > 0, message: bumped > 0 ? `Bump exitoso` : "Bump falló - posiblemente bloqueado", postsFound: postIds.length, bumped };

  } catch (err: any) {
    return { user: username, success: false, message: `Error: ${err.message}`, postsFound: 0, bumped: 0 };
  }
}

function extractPostIds(html: string): string[] {
  const ids: string[] = [];
  // Match post IDs from bump/edit/repost links
  const patterns = [
    /href="[^"]*\/users\/posts\/(?:bump|edit|repost)\/(\d{5,})/g,
    /data-post-id="(\d{5,})"/g,
    /data-id="(\d{5,})"/g,
  ];
  for (const pat of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(html)) !== null) {
      if (!ids.includes(m[1])) ids.push(m[1]);
    }
  }
  return ids;
}

async function fetchDirect(
  url: string, agent: any, cookies: string, ua: string,
  method = "GET", referer?: string
): Promise<{ ok: boolean; status: number; body: string; newCookies: string[] }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const headers: Record<string, string> = {
      "User-Agent": ua,
      "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "identity",
      "Host": u.hostname,
      "Connection": "keep-alive",
    };
    if (cookies) headers["Cookie"] = cookies;
    if (referer) { headers["Referer"] = referer; headers["Origin"] = "https://megapersonals.eu"; }

    const req = (lib as typeof https).request({
      hostname: u.hostname, port: u.port || 443,
      path: u.pathname + u.search, method, agent, headers, timeout: 20000,
    }, r => {
      const sc = (() => { const raw = r.headers["set-cookie"]; return !raw ? [] : Array.isArray(raw) ? raw : [raw]; })();

      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(r.statusCode!) && r.headers.location) {
        r.resume();
        const redir = new URL(r.headers.location, url).href;
        let ck = cookies;
        if (sc.length) { const nv = sc.map((s: string) => s.split(";")[0]); ck = (ck ? ck + "; " : "") + nv.join("; "); }
        return fetchDirect(redir, agent, ck, ua, "GET", referer)
          .then(res => { res.newCookies = [...sc, ...res.newCookies]; resolve(res); }).catch(reject);
      }

      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => resolve({
        ok: (r.statusCode || 0) >= 200 && (r.statusCode || 0) < 400,
        status: r.statusCode || 0,
        body: Buffer.concat(chunks).toString("utf-8"),
        newCookies: sc,
      }));
      r.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

async function getAllUsers(): Promise<Record<string, ProxyUser> | null> {
  return new Promise((res, rej) => {
    https.get(`${FB_URL}/proxyUsers.json`, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => { try { res(JSON.parse(d)); } catch { res(null); } });
      r.on("error", rej);
    }).on("error", rej);
  });
}

async function fbPatch(username: string, data: object): Promise<void> {
  const body = JSON.stringify(data);
  await new Promise<void>((res, rej) => {
    const url = new URL(`${FB_URL}/proxyUsers/${username.toLowerCase()}.json`);
    const req = https.request({ hostname: url.hostname, path: url.pathname, method: "PATCH",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, r => { r.resume(); r.on("end", () => res()); });
    req.on("error", rej); req.write(body); req.end();
  });
}

async function mergeCookies(username: string, newCookies: string[], existing: string): Promise<void> {
  try {
    const cookieMap: Record<string, string> = {};
    if (existing) existing.split(";").forEach(c => {
      const [k, ...v] = c.trim().split("="); if (k) cookieMap[k.trim()] = v.join("=").trim();
    });
    newCookies.forEach(c => {
      const part = c.split(";")[0].trim(); const [k, ...v] = part.split("="); if (k) cookieMap[k.trim()] = v.join("=").trim();
    });
    const cookieStr = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join("; ");
    const body = JSON.stringify({ cookies: cookieStr, cookieTs: Date.now() });
    await new Promise<void>((res, rej) => {
      const url = new URL(`${FB_URL}/proxyUsers/${username.toLowerCase()}.json`);
      const req = https.request({ hostname: url.hostname, path: url.pathname, method: "PATCH",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
      }, r => { r.resume(); r.on("end", () => res()); });
      req.on("error", rej); req.write(body); req.end();
    });
  } catch (e) {}
}

const UA_MAP: Record<string, string> = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};
function getUA(u: ProxyUser) {
  if (u.userAgentKey === "custom" && (u as any).userAgent) return (u as any).userAgent;
  return UA_MAP[u.userAgentKey || ""] || UA_MAP.iphone;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function jsonRes(body: object, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
