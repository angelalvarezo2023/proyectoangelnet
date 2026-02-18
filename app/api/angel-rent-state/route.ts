// app/api/angel-rent-state/route.ts
// Called by client when robot is toggled ON/OFF or paused/resumed
// Also used by admin to pause individual users or all users

import https from "https";

const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";
export const runtime = "nodejs";
export const maxDuration = 10;

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new Response("", { status: 200, headers: cors() });
}

// Client updates robot state
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const username = url.searchParams.get("u");
    if (!username) return jres(400, { error: "Falta ?u=" });

    const body = await req.json();
    const { robotOn, robotPaused } = body;

    await patchUser(username, { robotOn: !!robotOn, robotPaused: !!robotPaused });
    return jres(200, { ok: true });
  } catch (e: any) {
    return jres(500, { error: e.message });
  }
}

// Admin GET endpoint: pause/resume a user or all users
// Examples:
//   /api/angel-rent-state?admin=SECRET&action=pause&user=carlos
//   /api/angel-rent-state?admin=SECRET&action=resume&user=carlos
//   /api/angel-rent-state?admin=SECRET&action=pauseAll
//   /api/angel-rent-state?admin=SECRET&action=resumeAll
//   /api/angel-rent-state?admin=SECRET&action=status
export async function GET(req: Request) {
  const url = new URL(req.url);
  const adminSecret = url.searchParams.get("admin");
  const ADMIN_SECRET = process.env.BUMP_SECRET || "angel-rent-secret-2024";

  if (adminSecret !== ADMIN_SECRET) return jres(401, { error: "Unauthorized" });

  const action = url.searchParams.get("action") || "status";
  const targetUser = url.searchParams.get("user");

  try {
    const users = await getAllUsers();
    if (!users) return jres(200, { ok: true, users: {} });

    if (action === "status") {
      const status: Record<string, object> = {};
      for (const [u, data] of Object.entries(users)) {
        if (!data.active) continue;
        status[u] = {
          active: data.active,
          robotOn: data.robotOn || false,
          robotPaused: data.robotPaused || false,
          hasCookies: !!data.cookies,
          cookieAge: data.cookieTs ? Math.round((Date.now() - data.cookieTs) / 3600000) + "h" : "nunca",
          rentalEnd: data.rentalEnd || "sin fecha",
        };
      }
      return jres(200, { ok: true, users: status });
    }

    if (action === "pause" && targetUser) {
      await patchUser(targetUser, { robotPaused: true });
      return jres(200, { ok: true, message: `${targetUser} pausado` });
    }

    if (action === "resume" && targetUser) {
      await patchUser(targetUser, { robotPaused: false });
      return jres(200, { ok: true, message: `${targetUser} reanudado` });
    }

    if (action === "pauseAll") {
      const promises = Object.keys(users)
        .filter(u => users[u].active && users[u].robotOn)
        .map(u => patchUser(u, { robotPaused: true }));
      await Promise.all(promises);
      return jres(200, { ok: true, message: `Todos los robots pausados` });
    }

    if (action === "resumeAll") {
      const promises = Object.keys(users)
        .filter(u => users[u].active && users[u].robotOn)
        .map(u => patchUser(u, { robotPaused: false }));
      await Promise.all(promises);
      return jres(200, { ok: true, message: `Todos los robots reanudados` });
    }

    return jres(400, { error: "Accion no reconocida" });
  } catch (e: any) {
    return jres(500, { error: e.message });
  }
}

async function patchUser(username: string, data: object): Promise<void> {
  const body = JSON.stringify(data);
  await new Promise<void>((res, rej) => {
    const url = new URL(`${FB_URL}/proxyUsers/${username.toLowerCase()}.json`);
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: "PATCH",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, r => { r.resume(); r.on("end", () => res()); });
    req.on("error", rej); req.write(body); req.end();
  });
}

async function getAllUsers(): Promise<Record<string, any> | null> {
  return new Promise((res, rej) => {
    https.get(`${FB_URL}/proxyUsers.json`, r => {
      let d = ""; r.on("data", c => d += c);
      r.on("end", () => { try { res(JSON.parse(d)); } catch { res(null); } });
      r.on("error", rej);
    }).on("error", rej);
  });
}

function jres(status: number, body: object) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", ...cors() }
  });
}
