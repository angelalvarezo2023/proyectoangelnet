/**
 * ProxyShop · Storage via GitHub Gist
 *
 * Un solo archivo JSON en un Gist privado guarda todo:
 * pool de IPs, órdenes, historial de clientes y stats.
 *
 * Variables de entorno requeridas:
 *   GITHUB_TOKEN   → token de GitHub con permiso "gist"
 *   GIST_ID        → ID del gist (se crea una sola vez)
 */

// ─── TIPOS ────────────────────────────────────────────

export type OrderStatus = "pending_payment" | "pending_confirm" | "completed" | "cancelled";
export type OrderType   = "compra" | "renovacion";

export interface Order {
  orderId: string;
  chatId: number;
  firstName: string;
  username?: string;
  qty: number;
  metodoPago: string;
  status: OrderStatus;
  createdAt: number;
  tipo: OrderType;
  proxyRenovar?: string;
  proxiesEntregados?: string[];
}

export interface ClientProxy {
  id: string;
  chatId: number;
  full: string;          // "ip:port" o "ip:port:user:pass"
  orderId: string;
  fechaExpira: number;
  avisado: boolean;
}

export interface StatEntry {
  orderId: string;
  chatId: number;
  firstName: string;
  username?: string;
  qty: number;
  metodoPago: string;
  monto: string;
  tipo: OrderType;
  fecha: number;
}

interface DB {
  pool:          string[];                        // IPs disponibles
  orders:        Record<string, Order>;           // orderId → Order
  clientProxies: Record<string, ClientProxy[]>;  // chatId  → proxies
  stats:         StatEntry[];
}

// ─── GIST CLIENT ──────────────────────────────────────

const GITHUB_API  = "https://api.github.com";
const FILE_NAME   = "proxyshop-db.json";

function headers() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** Lee toda la base de datos desde el Gist */
async function readDB(): Promise<DB> {
  const res = await fetch(`${GITHUB_API}/gists/${process.env.GIST_ID}`, {
    headers: headers(),
    // Sin cache: siempre leer la versión más reciente
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Gist read error ${res.status}`);

  const gist = await res.json();
  const content = gist.files?.[FILE_NAME]?.content;

  if (!content) return emptyDB();

  try {
    return JSON.parse(content) as DB;
  } catch {
    return emptyDB();
  }
}

/** Escribe toda la base de datos al Gist */
async function writeDB(db: DB): Promise<void> {
  const res = await fetch(`${GITHUB_API}/gists/${process.env.GIST_ID}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({
      files: {
        [FILE_NAME]: { content: JSON.stringify(db, null, 2) },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gist write error ${res.status}: ${err}`);
  }
}

function emptyDB(): DB {
  return { pool: [], orders: {}, clientProxies: {}, stats: [] };
}

// ─── POOL DE IPs ──────────────────────────────────────

export async function poolAdd(ip: string): Promise<number> {
  const db = await readDB();
  const clean = ip.trim();
  if (!db.pool.includes(clean)) db.pool.unshift(clean);
  await writeDB(db);
  return db.pool.length;
}

export async function poolTake(qty: number): Promise<string[]> {
  const db  = await readDB();
  const taken = db.pool.splice(0, qty);
  await writeDB(db);
  return taken;
}

export async function poolCount(): Promise<number> {
  const db = await readDB();
  return db.pool.length;
}

export async function poolList(): Promise<string[]> {
  const db = await readDB();
  return db.pool;
}

export async function poolRemove(ip: string): Promise<void> {
  const db  = await readDB();
  db.pool   = db.pool.filter((x) => x !== ip.trim());
  await writeDB(db);
}

export async function poolFlush(): Promise<void> {
  const db  = await readDB();
  db.pool   = [];
  await writeDB(db);
}

// ─── ÓRDENES ──────────────────────────────────────────

export async function saveOrder(order: Order): Promise<void> {
  const db = await readDB();
  db.orders[order.orderId] = order;
  await writeDB(db);
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const db = await readDB();
  return db.orders[orderId] ?? null;
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  proxiesEntregados?: string[]
): Promise<void> {
  const db = await readDB();
  if (!db.orders[orderId]) return;
  db.orders[orderId].status = status;
  if (proxiesEntregados) db.orders[orderId].proxiesEntregados = proxiesEntregados;
  await writeDB(db);
}

// ─── PROXIES DE CLIENTES ──────────────────────────────

export async function saveClientProxy(cp: ClientProxy): Promise<void> {
  const db  = await readDB();
  const key = String(cp.chatId);
  if (!db.clientProxies[key]) db.clientProxies[key] = [];

  const idx = db.clientProxies[key].findIndex((p) => p.id === cp.id);
  if (idx >= 0) {
    db.clientProxies[key][idx] = cp;        // actualizar existente
  } else {
    db.clientProxies[key].push(cp);         // agregar nuevo
  }

  await writeDB(db);
}

export async function getClientProxies(chatId: number): Promise<ClientProxy[]> {
  const db = await readDB();
  return db.clientProxies[String(chatId)] ?? [];
}

export async function markAvisado(id: string, chatId: number): Promise<void> {
  const db  = await readDB();
  const key = String(chatId);
  const cp  = db.clientProxies[key]?.find((p) => p.id === id);
  if (cp) {
    cp.avisado = true;
    await writeDB(db);
  }
}

export async function getProxiesParaAvisar(diasAviso: number): Promise<ClientProxy[]> {
  const db     = await readDB();
  const ahora  = Date.now();
  const limite = ahora + diasAviso * 24 * 60 * 60 * 1000;
  const result: ClientProxy[] = [];

  for (const proxies of Object.values(db.clientProxies)) {
    for (const cp of proxies) {
      if (!cp.avisado && cp.fechaExpira > ahora && cp.fechaExpira <= limite) {
        result.push(cp);
      }
    }
  }
  return result;
}

// ─── ESTADÍSTICAS ─────────────────────────────────────

export async function saveStat(entry: StatEntry): Promise<void> {
  const db = await readDB();
  db.stats.push(entry);
  // Mantener solo los últimos 500 registros para que el JSON no crezca demasiado
  if (db.stats.length > 500) db.stats = db.stats.slice(-500);
  await writeDB(db);
}

export async function getStatsMes(month: number, year: number): Promise<StatEntry[]> {
  const db    = await readDB();
  const inicio = new Date(year, month, 1).getTime();
  const fin    = new Date(year, month + 1, 0, 23, 59, 59).getTime();
  return db.stats.filter((s) => s.fecha >= inicio && s.fecha <= fin);
}
