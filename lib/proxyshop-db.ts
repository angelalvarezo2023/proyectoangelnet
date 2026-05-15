    // lib/proxyshop-db.ts
// Capa de persistencia Firebase para el bot ProxyShop
// Usa la misma instancia de Firebase del proyecto

import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";

// ─── COLECCIONES ───────────────────────────────────────
const COL_POOL        = "proxyshop_pool";        // IPs disponibles para vender
const COL_ORDERS      = "proxyshop_orders";      // Órdenes
const COL_CLIENT_IPS  = "proxyshop_client_ips";  // IPs vendidas a clientes
const COL_STATS       = "proxyshop_stats";       // Estadísticas de ventas

// ─── TIPOS ─────────────────────────────────────────────
export type ProxyEntry = {
  id?: string;
  hostPort: string;
  full: string;
  addedAt: number;
};

export type OrderStatus = "pending_payment" | "pending_confirm" | "completed" | "cancelled";
export type OrderType = "compra" | "renovacion";

export type Order = {
  id?: string;
  orderId: string;
  chatId: number;
  firstName: string;
  username?: string;
  qty: number;
  metodoPago: string;
  status: OrderStatus;
  createdAt: number;
  tipo: OrderType;
  proxies?: string[];
  proxyRenovar?: string;
};

export type ClientProxy = {
  id?: string;
  chatId: number;
  full: string;
  orderId: string;
  fechaExpira: number; // unix timestamp
  avisado: boolean;
};

export type StatEntry = {
  id?: string;
  orderId: string;
  chatId: number;
  firstName: string;
  username?: string;
  qty: number;
  metodoPago: string;
  monto: string;
  tipo: OrderType;
  fecha: number; // unix timestamp
};

// ─── POOL DE IPs ───────────────────────────────────────
export async function getPool(): Promise<ProxyEntry[]> {
  const snap = await getDocs(collection(db, COL_POOL));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProxyEntry));
}

export async function addToPool(entry: Omit<ProxyEntry, "id">): Promise<void> {
  await addDoc(collection(db, COL_POOL), entry);
}

export async function removeFromPool(hostPort: string): Promise<void> {
  const snap = await getDocs(collection(db, COL_POOL));
  for (const d of snap.docs) {
    if ((d.data() as ProxyEntry).hostPort === hostPort) {
      await deleteDoc(doc(db, COL_POOL, d.id));
    }
  }
}

export async function removeFromPoolMany(hostPorts: string[]): Promise<void> {
  for (const hp of hostPorts) {
    await removeFromPool(hp);
  }
}

// ─── ÓRDENES ───────────────────────────────────────────
export async function saveOrder(order: Order): Promise<void> {
  await setDoc(doc(db, COL_ORDERS, order.orderId), order);
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const snap = await getDoc(doc(db, COL_ORDERS, orderId));
  if (!snap.exists()) return null;
  return snap.data() as Order;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, proxies?: string[]): Promise<void> {
  const data: any = { status };
  if (proxies) data.proxies = proxies;
  await updateDoc(doc(db, COL_ORDERS, orderId), data);
}

// ─── IPs DE CLIENTES ───────────────────────────────────
export async function getClientProxies(chatId: number): Promise<ClientProxy[]> {
  const q = query(collection(db, COL_CLIENT_IPS), where("chatId", "==", chatId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClientProxy));
}

export async function saveClientProxy(cp: Omit<ClientProxy, "id">): Promise<void> {
  // Si ya existe una con el mismo hostPort para este cliente, actualizarla
  const hostPort = cp.full.split(":").slice(0, 2).join(":");
  const existing = await getClientProxies(cp.chatId);
  const found = existing.find((p) => p.full.startsWith(hostPort));
  if (found?.id) {
    await updateDoc(doc(db, COL_CLIENT_IPS, found.id), {
      fechaExpira: cp.fechaExpira,
      avisado: false,
    });
  } else {
    await addDoc(collection(db, COL_CLIENT_IPS), cp);
  }
}

export async function markAvisado(id: string): Promise<void> {
  await updateDoc(doc(db, COL_CLIENT_IPS, id), { avisado: true });
}

// Obtener todas las IPs que necesitan aviso de expiración
export async function getProxiesParaAvisar(diasAntes: number): Promise<ClientProxy[]> {
  const now = Date.now();
  const limite = now + diasAntes * 24 * 60 * 60 * 1000;
  const snap = await getDocs(collection(db, COL_CLIENT_IPS));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ClientProxy))
    .filter((cp) => !cp.avisado && cp.fechaExpira <= limite && cp.fechaExpira >= now);
}

// ─── ESTADÍSTICAS ──────────────────────────────────────
export async function saveStat(stat: Omit<StatEntry, "id">): Promise<void> {
  await addDoc(collection(db, COL_STATS), stat);
}

export async function getStatsMes(mes: number, anio: number): Promise<StatEntry[]> {
  const inicio = new Date(anio, mes, 1).getTime();
  const fin    = new Date(anio, mes + 1, 0, 23, 59, 59).getTime();
  const snap   = await getDocs(collection(db, COL_STATS));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as StatEntry))
    .filter((s) => s.fecha >= inicio && s.fecha <= fin);
}
