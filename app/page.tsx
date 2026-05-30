"use client";
import { useState, useEffect, useRef } from "react";

const FB_URL = "https://megapersonals-control-default-rtdb.firebaseio.com";
const ADMIN_PASSWORD = "admin2024";
const WHATSAPP_NUMERO = "18293837695"; // Número de Angel (sin + ni espacios)

// Convierte una URL de MegaPersonals a una URL del proxy local en Vercel.
// Esto permite que los clientes en RD (donde MegaPersonals está bloqueado) puedan
// ver las fotos sin VPN. El proxy las pide desde Vercel y las sirve.
function imagenViaProxy(url?: string): string {
  if (!url) return "";
  if (!url.startsWith("http")) return url; // Ya es relativa, no necesita proxy
  return `/api/mp-image?url=${encodeURIComponent(url)}`;
}

// Lista completa de estados de US con sus ciudades, replicando lo de MegaPersonals.
// Se usa en el modal selector de ubicación al editar un post.
const US_LOCATIONS: Record<string, { abrev: string; ciudades: string[] }> = {
  "Alabama": { abrev: "AL", ciudades: ["Auburn","Birmingham","Dothan","Gadsden","Huntsville","Mobile","Montgomery","Muscle Shoals","Tuscaloosa"] },
  "Alaska": { abrev: "AK", ciudades: ["Anchorage","Fairbanks","Juneau","Kenai Peninsula"] },
  "Arizona": { abrev: "AZ", ciudades: ["Flagstaff","Mohave County","Phoenix","Prescott","Show Low","Sierra Vista","Tucson","Yuma"] },
  "Arkansas": { abrev: "AR", ciudades: ["Fayetteville","Fort Smith","Jonesboro","Little Rock"] },
  "California": { abrev: "CA", ciudades: ["Bakersfield","Chico","Concord","Fresno","Humboldt County","Imperial County","Inland Empire","Lancaster","Long Beach","Los Angeles","Mendocino","Merced","Modesto","Monterey","North Bay","Oakland","Orange County","Palm Springs","Redding","Sacramento","San Diego","San Fernando Valley","San Francisco","San Gabriel Valley","San Jose","San Luis Obispo","San Mateo","Santa Barbara","Santa Cruz","Santa Maria","Siskiyou","Stockton","Ventura","Visalia"] },
  "Colorado": { abrev: "CO", ciudades: ["Boulder","Colorado Springs","Denver","Fort Collins","Pueblo","Rockies","Western Slope"] },
  "Connecticut": { abrev: "CT", ciudades: ["Bridgeport","Eastern Connecticut","Hartford","New Haven","Northwest"] },
  "Delaware": { abrev: "DE", ciudades: ["Dover","Milford","Wilmington"] },
  "District of Columbia": { abrev: "DC", ciudades: ["Annandale","Northern Virginia","Southern Maryland"] },
  "Florida": { abrev: "FL", ciudades: ["Daytona","Fort Lauderdale","Fort Myers","Gainesville","Jacksonville","Keys","Miami","Ocala","Okaloosa","Orlando","Palm Bay","Panama City","Pensacola","Sarasota","Space Coast","St. Augustine","Tallahassee","Tampa","Treasure Coast","West Palm Beach"] },
  "Georgia": { abrev: "GA", ciudades: ["Albany","Athens","Atlanta","Augusta","Brunswick","Columbus","Macon","Northwest Georgia","Savannah","Statesboro","Valdosta"] },
  "Hawaii": { abrev: "HI", ciudades: ["Big Island","Honolulu","Kauai","Maui"] },
  "Idaho": { abrev: "ID", ciudades: ["Boise","East Idaho","Lewiston","Twin Falls"] },
  "Illinois": { abrev: "IL", ciudades: ["Bloomington","Carbondale","Chambana","Chicago","Decatur","La Salle County","Mattoon","Peoria","Rockford","Springfield","Western Illinois"] },
  "Indiana": { abrev: "IN", ciudades: ["Bloomington","Evansville","Ft Wayne","Indianapolis","Kokomo","Lafayette","Muncie","Richmond","South Bend","Terre Haute"] },
  "Iowa": { abrev: "IA", ciudades: ["Ames","Cedar Rapids","Desmoines","Dubuque","Fort Dodge","Iowa City","Mason City","Quad Cities","Sioux City","Southeast Iowa","Waterloo"] },
  "Kansas": { abrev: "KS", ciudades: ["Lawrence","Manhattan","Salina","Topeka","Wichita"] },
  "Kentucky": { abrev: "KY", ciudades: ["Bowling Green","Eastern Kentucky","Lexington","Louisville","Owensboro","Western Kentucky"] },
  "Louisiana": { abrev: "LA", ciudades: ["Alexandria","Baton Rouge","Hammond","Houma","Lafayette","Lake Charles","Monroe","New Orleans","Shreveport"] },
  "Maine": { abrev: "ME", ciudades: ["Bangor","Lewiston-Auburn","Portland"] },
  "Maryland": { abrev: "MD", ciudades: ["Annapolis","Baltimore","Cumberland Valley","Eastern Shore","Frederick","Western Maryland"] },
  "Massachusetts": { abrev: "MA", ciudades: ["Boston","Brockton","Cape Cod","Lowell","South Coast","Springfield","Worcester"] },
  "Michigan": { abrev: "MI", ciudades: ["Ann Arbor","Battle Creek","Central Michigan","Detroit","Flint","Grand Rapids","Holland","Jackson","Kalamazoo","Lansing","Monroe","Muskegon","Northern Michigan","Port Huron","Saginaw","Southwest Michigan","Upper Peninsula"] },
  "Minnesota": { abrev: "MN", ciudades: ["Bemidji","Brainerd","Duluth","Mankato","Minneapolis","Rochester","St. Cloud"] },
  "Mississippi": { abrev: "MS", ciudades: ["Biloxi","Hattiesburg","Jackson","Meridian","North Mississippi","Southwest Mississippi"] },
  "Missouri": { abrev: "MO", ciudades: ["Columbia","Joplin","Kansas City","Kirksville","Lake Of The Ozarks","Saint Louis","Southeast Missouri","Springfield","St Joseph"] },
  "Montana": { abrev: "MT", ciudades: ["Billings","Bozeman","Butte","Great Falls","Helena","Kalispell","Missoula"] },
  "Nebraska": { abrev: "NE", ciudades: ["Grand Island","Lincoln","North Platte","Omaha","Scottsbluff"] },
  "Nevada": { abrev: "NV", ciudades: ["Elko","Las Vegas","Reno","Virginia City"] },
  "New Hampshire": { abrev: "NH", ciudades: ["Concord","Dover","Manchester","Nashua"] },
  "New Jersey": { abrev: "NJ", ciudades: ["Central Jersey","Jersey Shore","North Jersey","South Jersey"] },
  "New Mexico": { abrev: "NM", ciudades: ["Albuquerque","Clovis","Farmington","Las Cruces","Roswell","Santa Fe"] },
  "New York": { abrev: "NY", ciudades: ["Albany","Binghamton","Bronx","Brooklyn","Buffalo","Catskills","Chautauqua","Elmira","Finger Lakes","Glens Falls","Hudson Valley","Ithaca","Long Island","Manhattan","Oneonta","Plattsburgh","Potsdam","Queens","Rochester","Staten Island","Syracuse","Twin Tiers","Utica","Watertown","Westchester"] },
  "North Carolina": { abrev: "NC", ciudades: ["Asheville","Boone","Charlotte","Eastern","Fayetteville","Greensboro","Hickory","High Point","Outer Banks","Raleigh","Raleigh-Durham","Wilmington","Winston-Salem"] },
  "North Dakota": { abrev: "ND", ciudades: ["Bismarck","Fargo","Grand Forks","Minot"] },
  "Ohio": { abrev: "OH", ciudades: ["Akron","Ashtabula","Athens","Cambridge","Chillicothe","Cincinnati","Cleveland","Columbus","Dayton","Findlay","Mansfield","Sandusky","Toledo","Tuscarawas County","Youngstown"] },
  "Oklahoma": { abrev: "OK", ciudades: ["Lawton","Norman","Oklahoma City","Stillwater","Tulsa"] },
  "Oregon": { abrev: "OR", ciudades: ["Bend","Corvallis","East Oregon","Eugene","Klamath Falls","Medford","Oregon Coast","Portland","Roseburg","Salem"] },
  "Pennsylvania": { abrev: "PA", ciudades: ["Allentown","Altoona","Chambersburg","Erie","Harrisburg","Lancaster","Meadville","Penn State","Philadelphia","Pittsburgh","Poconos","Reading","Scranton","Williamsport","York"] },
  "Rhode Island": { abrev: "RI", ciudades: ["Providence","Warwick"] },
  "South Carolina": { abrev: "SC", ciudades: ["Charleston","Columbia","Florence","Greenville","Hilton Head","Myrtle Beach"] },
  "South Dakota": { abrev: "SD", ciudades: ["Aberdeen","Pierre","Rapid City","Sioux Falls"] },
  "Tennessee": { abrev: "TN", ciudades: ["Chattanooga","Clarksville","Cookeville","Johnson City","Knoxville","Memphis","Nashville","Tri-Cities"] },
  "Texas": { abrev: "TX", ciudades: ["Abilene","Amarillo","Austin","Beaumont","Brownsville","College Station","Corpus Christi","Dallas","Del Rio","Denton","El Paso","Fort Worth","Galveston","Houston","Huntsville","Killeen","Laredo","Longview","Lubbock","Mcallen","Mid Cities","Odessa","San Antonio","San Marcos","Texarkana","Texoma","Tyler","Victoria","Waco","Wichita Falls"] },
  "Utah": { abrev: "UT", ciudades: ["Logan","Ogden","Provo","Salt Lake City","St. George"] },
  "Vermont": { abrev: "VT", ciudades: ["Burlington","Colchester","Essex"] },
  "Virginia": { abrev: "VA", ciudades: ["Charlottesville","Chesapeake","Danville","Fredericksburg","Hampton","Harrisonburg","Lynchburg","New River Valley","Newport News","Norfolk","Portsmouth","Richmond","Roanoke","Southwest Virginia","Suffolk","Virginia Beach"] },
  "Washington": { abrev: "WA", ciudades: ["Bellingham","Everett","Moses Lake","Mt. Vernon","Olympia","Pullman","Seattle","Spokane","Tacoma","Tri-Cities","Wenatchee","Yakima"] },
  "West Virginia": { abrev: "WV", ciudades: ["Charleston","Huntington","Martinsburg","Morgantown","Parkersburg","Southern West Virginia","Wheeling"] },
  "Wisconsin": { abrev: "WI", ciudades: ["Appleton","Eau Claire","Green Bay","Janesville","La Crosse","Madison","Milwaukee","Racine","Sheboygan","Wausau"] },
  "Wyoming": { abrev: "WY", ciudades: ["Casper","Cheyenne","Laramie"] }
};

interface EditRequestFields {
  name?: string;
  age?: string;
  title?: string;
  body?: string;
  cityName?: string;
  location?: string;
}

interface EditRequest {
  status: "captcha_pendiente" | "captcha_listo" | "listo_para_publicar" | "aplicada" | "fallida";
  requestedAt: number;
  capturedAt?: number;
  expiresAt?: number;
  appliedAt?: number;
  failedAt?: number;
  failReason?: string;
  captchaUrl?: string;
  captchaKey?: string;
  captchaCode?: string;
  currentValues?: EditRequestFields;
  fields?: EditRequestFields;
}

interface PostCapturedData {
  capturedAt?: number;
  images?: string[];
  title?: string;
  body?: string;
}

interface PostData {
  status: "active" | "paused";
  nextBumpAt: number;
  lastBumpAt: number | null;
  addedAt: number;
  url: string;
  rentExpiresAt?: number | null;
  rentPaused?: boolean;
  editRequest?: EditRequest | null;
  data?: PostCapturedData;
}

interface ClientData {
  displayName: string;
  posts: Record<string, PostData>;
  banned?: boolean;
  bannedAt?: number;
}

type Step = "search" | "admin-list" | "cards";

export default function Home() {
  const [step, setStep] = useState<Step>("search");
  const [searchName, setSearchName] = useState("");
  const [clientKey, setClientKey] = useState("");
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [allClients, setAllClients] = useState<Record<string, ClientData>>({});
  const [adminFilter, setAdminFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [adminError, setAdminError] = useState("");
  const [rentModalPost, setRentModalPost] = useState<string | null>(null);
  const [rentDays, setRentDays] = useState("7");
  const [rentHours, setRentHours] = useState("0");

  // Estados del flujo de edición del cliente
  const [editConfirmPost, setEditConfirmPost] = useState<string | null>(null); // muestra modal de confirmación inicial
  const [editFormPost, setEditFormPost] = useState<string | null>(null);       // muestra modal de edición
  const [editStep, setEditStep] = useState<"fields" | "captcha">("fields");    // qué pantalla del modal
  const [editFields, setEditFields] = useState<EditRequestFields>({});         // valores que el cliente está editando
  const [editOriginalFields, setEditOriginalFields] = useState<EditRequestFields>({}); // valores originales (para comparar)
  const [editCaptchaCode, setEditCaptchaCode] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Estados del modal de selección de ubicación (city)
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [expandedState, setExpandedState] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("isAdmin") === "true") {
      setIsAdmin(true);
      setStep("admin-list");
      loadAllClients();
    }
  }, []);

  useEffect(() => {
    if (step !== "cards" || !clientKey) return;
    const interval = setInterval(async () => {
      const res = await fetch(`${FB_URL}/clients/${clientKey}.json`);
      const data = await res.json();
      if (data) setClientData(data);
    }, 5000);
    return () => clearInterval(interval);
  }, [step, clientKey]);

  useEffect(() => {
    if (step !== "admin-list" || !isAdmin) return;
    const interval = setInterval(() => loadAllClients(), 10000);
    return () => clearInterval(interval);
  }, [step, isAdmin]);

  const loadAllClients = async () => {
    try {
      const res = await fetch(`${FB_URL}/clients.json`);
      const data = await res.json();
      setAllClients(data || {});
    } catch (e) {
      console.error("Error loading clients", e);
    }
  };

  const searchClient = async () => {
    if (!searchName.trim()) {
      setError("Ingresa un nombre");
      return;
    }

    setLoading(true);
    setError("");

    const key = searchName.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

    try {
      const res = await fetch(`${FB_URL}/clients/${key}.json`);
      const data = await res.json();

      if (data && data.posts) {
        setClientKey(key);
        setClientData(data);
        setStep("cards");
      } else {
        setError("No encontramos publicaciones para este cliente");
      }
    } catch (e) {
      setError("Error de conexión");
    }

    setLoading(false);
  };

  const selectClient = (key: string, data: ClientData) => {
    setClientKey(key);
    setClientData(data);
    setStep("cards");
  };

  const togglePostStatus = async (postId: string, currentStatus: string) => {
    if (!clientData) return;

    const newStatus = currentStatus === "active" ? "paused" : "active";

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}/status.json`, {
      method: "PUT",
      body: JSON.stringify(newStatus),
    });

    setClientData({
      ...clientData,
      posts: {
        ...clientData.posts,
        [postId]: { ...clientData.posts[postId], status: newStatus as "active" | "paused" },
      },
    });
  };

  const handleAdminLogin = () => {
    if (adminPass === ADMIN_PASSWORD) {
      setIsAdmin(true);
      localStorage.setItem("isAdmin", "true");
      setShowAdminLogin(false);
      setAdminPass("");
      setAdminError("");
      setStep("admin-list");
      loadAllClients();
    } else {
      setAdminError("Contraseña incorrecta");
    }
  };

  const logoutAdmin = () => {
    setIsAdmin(false);
    localStorage.removeItem("isAdmin");
    setStep("search");
    setClientData(null);
    setClientKey("");
  };

  const verAnuncio = (postId: string) => {
    window.open(`https://megapersonals.eu/public/escort_post_detail/${postId}`, "_blank");
  };

  const renovarWhatsApp = (postId: string) => {
    const mensaje = `Hola Angel, quiero renovar la renta del post: #${postId}`;
    const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  };

  const renovarRenta = async (postId: string) => {
    if (!clientData) return;

    const post = clientData.posts[postId];
    const SEMANA = 7 * 24 * 60 * 60 * 1000;

    // Si el post YA tiene renta (vencida o no), el nuevo periodo se cuenta
    // desde la fecha de vencimiento original. Asi, si el cliente pago tarde,
    // el tiempo que estuvo en deuda se le descuenta automaticamente.
    // Si nunca tuvo renta, se cuenta desde ahora.
    const base = post.rentExpiresAt || Date.now();
    const newExpiry = base + SEMANA;

    // Reactivar el post solo si el nuevo vencimiento queda en el futuro.
    // (Si la deuda era mayor a lo pagado, seguiria vencido y pausado.)
    const reactivar = newExpiry > Date.now() && post.rentPaused;

    const updates: Partial<PostData> = { rentExpiresAt: newExpiry };
    if (reactivar) {
      updates.status = "active";
      updates.rentPaused = false;
    }

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}.json`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });

    setClientData({
      ...clientData,
      posts: {
        ...clientData.posts,
        [postId]: { ...post, ...updates },
      },
    });
  };

  const abrirModalRenta = (postId: string) => {
    setRentModalPost(postId);
    setRentDays("7");
    setRentHours("0");
  };

  const guardarRenta = async () => {
    if (!rentModalPost || !clientData) return;

    const days = parseInt(rentDays) || 0;
    const hours = parseInt(rentHours) || 0;

    if (days === 0 && hours === 0) {
      alert("⚠️ Ingresa al menos 1 día o 1 hora");
      return;
    }

    // El modal "Establecer" cuenta desde AHORA (renta limpia, sin cobrar deuda).
    // Usalo cuando quieras dar tiempo fresco. Para cobrar deuda usa el boton +7d.
    const newExpiry = Date.now() + days * 24 * 60 * 60 * 1000 + hours * 60 * 60 * 1000;

    const post = clientData.posts[rentModalPost];
    const updates: Partial<PostData> = { rentExpiresAt: newExpiry };
    // Si estaba pausado por renta vencida, reactivarlo
    if (post.rentPaused) {
      updates.status = "active";
      updates.rentPaused = false;
    }

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${rentModalPost}.json`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });

    setClientData({
      ...clientData,
      posts: {
        ...clientData.posts,
        [rentModalPost]: { ...post, ...updates },
      },
    });

    setRentModalPost(null);
  };

  const quitarRenta = async (postId: string) => {
    if (!clientData) return;
    if (!confirm("¿Quitar la renta de este post?")) return;

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}/rentExpiresAt.json`, {
      method: "PUT",
      body: JSON.stringify(null),
    });

    setClientData({
      ...clientData,
      posts: {
        ...clientData.posts,
        [postId]: { ...clientData.posts[postId], rentExpiresAt: null },
      },
    });
  };

  // ===========================================================
  // FLUJO DE EDICIÓN DEL CLIENTE
  // ===========================================================

  // Verifica si esta cuenta ya tiene una edición activa (en cualquier post).
  // Por regla: solo una edición a la vez por cuenta.
  const hayEdicionActiva = (): string | null => {
    if (!clientData) return null;
    for (const [pid, post] of Object.entries(clientData.posts)) {
      const s = post.editRequest?.status;
      if (s === "captcha_pendiente" || s === "captcha_listo" || s === "listo_para_publicar") {
        return pid;
      }
    }
    return null;
  };

  // Tracker de último intento de borrado por editRequest (postId:finishedAt → timestamp).
  // Usamos Map (no Set) para permitir reintentos: si Firebase no propagó el DELETE
  // a tiempo y el polling trae la editRequest de vuelta, reintentamos cada 3 segundos.
  const ultimoBorradoRef = useRef<Map<string, number>>(new Map());

  // Limpia automáticamente solicitudes terminadas/fallidas tras 5 segundos.
  // Si Firebase no propaga el DELETE y vuelve a llegar la editRequest en el polling,
  // reintentamos cada 3s hasta que efectivamente desaparezca. Esto evita que el mensaje
  // "Cambios aplicados" se quede pegado por minutos.
  useEffect(() => {
    if (!clientData) return;
    Object.entries(clientData.posts).forEach(async ([postId, post]) => {
      const er = post.editRequest;
      if (!er) return;
      const s = er.status;
      const finishedAt = er.appliedAt || er.failedAt;
      if (!finishedAt || (s !== "aplicada" && s !== "fallida")) return;
      if (now - finishedAt <= 5000) return;

      const clave = `${postId}:${finishedAt}`;
      const ultimoIntento = ultimoBorradoRef.current.get(clave) || 0;

      // Reintentar máximo cada 3 segundos
      if (now - ultimoIntento < 3000) return;
      ultimoBorradoRef.current.set(clave, now);

      // SIEMPRE actualizar el estado local INMEDIATAMENTE.
      // Si el polling trae la editRequest de vuelta, este código se ejecuta otra vez
      // y la vuelve a quitar del estado local. El mensaje no se queda pegado.
      setClientData((prev) => {
        if (!prev || !prev.posts[postId]) return prev;
        const existing = prev.posts[postId].editRequest;
        // Solo borrar si sigue siendo la MISMA editRequest (no una nueva)
        if (!existing) return prev;
        const existingFinish = existing.appliedAt || existing.failedAt;
        if (existingFinish !== finishedAt) return prev;
        const newPost = { ...prev.posts[postId] };
        delete newPost.editRequest;
        return {
          ...prev,
          posts: { ...prev.posts, [postId]: newPost },
        };
      });

      // Borrar de Firebase (idempotente: si ya no existe, no pasa nada)
      await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}/editRequest.json`, {
        method: "DELETE",
      });
    });
  }, [now, clientData, clientKey]);

  // Paso 1: el cliente toca "Editar publicación" en una tarjeta
  const iniciarEdicion = (postId: string) => {
    const existente = hayEdicionActiva();
    if (existente && existente !== postId) {
      alert(`⚠️ Ya tienes una edición en curso en otro post (#${existente}). Termina o cancela esa primero.`);
      return;
    }
    setEditConfirmPost(postId);
  };

  // Paso 2: el cliente confirma. Creamos la solicitud en Firebase con estado "captcha_pendiente"
  const confirmarEdicion = async () => {
    if (!editConfirmPost || !clientData) return;

    const editRequest: EditRequest = {
      status: "captcha_pendiente",
      requestedAt: Date.now(),
    };

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${editConfirmPost}/editRequest.json`, {
      method: "PUT",
      body: JSON.stringify(editRequest),
    });

    setClientData({
      ...clientData,
      posts: {
        ...clientData.posts,
        [editConfirmPost]: { ...clientData.posts[editConfirmPost], editRequest },
      },
    });

    setEditConfirmPost(null);
  };

  // Paso 3: el cliente toca "Editar ahora" cuando el captcha ya está listo.
  // Abrimos el formulario en la pantalla 1 (campos editables, sin captcha aún).
  const abrirFormularioEdicion = (postId: string) => {
    if (!clientData) return;
    const post = clientData.posts[postId];
    if (!post.editRequest || post.editRequest.status !== "captcha_listo") return;

    // Pre-llenar los campos con los valores actuales que capturó el bot
    const current: EditRequestFields = {
      name: post.editRequest.currentValues?.name || "",
      age: post.editRequest.currentValues?.age || "",
      title: post.editRequest.currentValues?.title || "",
      body: post.editRequest.currentValues?.body || "",
      cityName: post.editRequest.currentValues?.cityName || "",
      location: post.editRequest.currentValues?.location || "",
    };
    setEditFields(current);
    setEditOriginalFields(current); // guardar copia para comparar después
    setEditCaptchaCode("");
    setEditStep("fields"); // empezar en la pantalla 1
    setEditFormPost(postId);
  };

  // Validación de los campos antes de avanzar al captcha
  const validarCampos = (): string | null => {
    if (!editFields.title?.trim()) return "El titular (Headline) no puede estar vacío";
    if (!editFields.body?.trim()) return "La descripción (Body) no puede estar vacía";
    return null;
  };

  // Avanzar de pantalla "fields" a "captcha"
  const irAlCaptcha = () => {
    const err = validarCampos();
    if (err) {
      alert("⚠️ " + err);
      return;
    }
    setEditStep("captcha");
  };

  // Volver de "captcha" a "fields" para editar los campos
  const volverAFields = () => {
    setEditStep("fields");
  };

  // Paso 4: el cliente envía el formulario completo (campos modificados + captcha)
  const enviarEdicion = async () => {
    if (!editFormPost || !clientData) return;
    if (!editCaptchaCode.trim()) {
      alert("⚠️ Escribe el código del captcha");
      return;
    }
    const errCampos = validarCampos();
    if (errCampos) {
      alert("⚠️ " + errCampos);
      setEditStep("fields");
      return;
    }

    // Construir 'fields' SOLO con los campos que el cliente realmente cambió
    // Comparando contra los valores originales que capturó el bot.
    const cambios: EditRequestFields = {};
    (Object.keys(editFields) as (keyof EditRequestFields)[]).forEach((key) => {
      const valNuevo = (editFields[key] || "").trim();
      const valOriginal = (editOriginalFields[key] || "").trim();
      if (valNuevo !== valOriginal) {
        cambios[key] = valNuevo;
      }
    });

    setEditSubmitting(true);

    const updates: Partial<EditRequest> = {
      status: "listo_para_publicar",
      captchaCode: editCaptchaCode.trim(),
      fields: cambios, // SOLO los campos modificados
    };

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${editFormPost}/editRequest.json`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });

    const post = clientData.posts[editFormPost];
    setClientData({
      ...clientData,
      posts: {
        ...clientData.posts,
        [editFormPost]: {
          ...post,
          editRequest: { ...(post.editRequest as EditRequest), ...updates } as EditRequest,
        },
      },
    });

    setEditSubmitting(false);
    setEditFormPost(null);
  };

  // Cancelar edición en cualquier momento (antes de "aplicada")
  const cancelarEdicion = async (postId: string) => {
    if (!confirm("¿Cancelar la edición de este post?")) return;

    await fetch(`${FB_URL}/clients/${clientKey}/posts/${postId}/editRequest.json`, {
      method: "DELETE",
    });

    if (clientData) {
      const newPosts = { ...clientData.posts };
      if (newPosts[postId]) {
        const { editRequest, ...rest } = newPosts[postId];
        newPosts[postId] = rest;
      }
      setClientData({ ...clientData, posts: newPosts });
    }

    setEditFormPost(null);
  };

  // Selector de ubicación: el usuario eligió una ciudad de un estado
  const seleccionarCiudad = (ciudad: string, abrev: string) => {
    setEditFields({ ...editFields, cityName: `${ciudad}, ${abrev}` });
    setShowLocationPicker(false);
    setExpandedState(null);
  };

  // Abre el modal del selector
  const abrirSelectorUbicacion = () => {
    setExpandedState(null);
    setShowLocationPicker(true);
  };

  const formatTime = (timestamp: number) => {
    const diff = timestamp - now;
    if (diff <= 0) return { mins: "00", secs: "00", total: 0 };

    const totalSecs = Math.floor(diff / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;

    return {
      mins: mins.toString().padStart(2, "0"),
      secs: secs.toString().padStart(2, "0"),
      total: totalSecs,
    };
  };

  const getProgress = (post: PostData) => {
    const start = post.lastBumpAt || post.addedAt;
    const total = post.nextBumpAt - start;
    const elapsed = now - start;
    if (total <= 0) return 100;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  const getRentInfo = (post: PostData) => {
    if (!post.rentExpiresAt) {
      return { status: "none" as const, days: 0, hours: 0, isWarning: false, totalHours: 0, debtDays: 0, debtHours: 0 };
    }

    const diff = post.rentExpiresAt - now;
    if (diff <= 0) {
      // Renta vencida: calcular el tiempo que lleva en deuda
      const debtMs = now - post.rentExpiresAt;
      const debtTotalHours = Math.floor(debtMs / (60 * 60 * 1000));
      const debtDays = Math.floor(debtTotalHours / 24);
      const debtHours = debtTotalHours % 24;
      return { status: "expired" as const, days: 0, hours: 0, isWarning: false, totalHours: 0, debtDays, debtHours };
    }

    const totalHours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    // Advertencia cuando queda 1 día (24h) o menos
    const isWarning = totalHours <= 24;

    return { status: "active" as const, days, hours, isWarning, totalHours, debtDays: 0, debtHours: 0 };
  };

  const goBack = () => {
    if (isAdmin) {
      setStep("admin-list");
      setClientData(null);
      setClientKey("");
    } else {
      setStep("search");
      setSearchName("");
      setClientData(null);
      setClientKey("");
      setError("");
    }
  };

  const getGlobalStats = () => {
    let totalPosts = 0;
    let activePosts = 0;
    let pausedPosts = 0;
    let totalClients = Object.keys(allClients).length;

    Object.values(allClients).forEach((client) => {
      if (client.posts) {
        const posts = Object.values(client.posts);
        totalPosts += posts.length;
        activePosts += posts.filter((p) => p.status === "active").length;
        pausedPosts += posts.filter((p) => p.status === "paused").length;
      }
    });

    return { totalClients, totalPosts, activePosts, pausedPosts };
  };

  const filteredClients = Object.entries(allClients)
    .filter(([key, data]) => {
      if (!adminFilter) return true;
      const query = adminFilter.toLowerCase();
      return data.displayName?.toLowerCase().includes(query) || key.includes(query);
    })
    // Ordenar por urgencia: cuenta baneada > en deuda > por vencer > con renta > sin renta > inactivo
    .sort(([, a], [, b]) => {
      const score = (data: ClientData) => {
        // Cuenta baneada: máxima urgencia (necesita atención inmediata)
        if (data.banned) return 0;

        // Sacar la fecha más urgente entre todos sus posts
        const posts = Object.values(data.posts || {});
        if (!posts.length) return 6; // sin posts: lo último

        // Buscar la renta más cercana a vencer (o ya vencida)
        const fechas = posts
          .map((p) => p.rentExpiresAt)
          .filter((x): x is number => typeof x === "number");

        if (!fechas.length) return 5; // ningún post con renta configurada

        const minFecha = Math.min(...fechas);
        const diff = minFecha - now;

        if (diff <= 0) return 1; // en deuda
        if (diff <= 24 * 3600 * 1000) return 2; // por vencer (<= 24h)
        if (diff <= 7 * 24 * 3600 * 1000) return 3; // próximo (<= 7d)
        return 4; // tiempo lejano
      };

      const sA = score(a);
      const sB = score(b);
      if (sA !== sB) return sA - sB;

      // Empate: por nombre alfabético
      return (a.displayName || "").localeCompare(b.displayName || "");
    });

  // Calcular contador de baneos por semana (últimos 7 días)
  const baneosEstaSemana = Object.values(allClients).filter(
    (c) => c.banned && c.bannedAt && now - c.bannedAt <= 7 * 24 * 3600 * 1000
  ).length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg-0: #030305;
          --bg-1: #07070d;
          --bg-2: #0a0a14;
          --bg-3: #0f0f1c;
          --surface: rgba(255,255,255,0.03);
          --surface-2: rgba(255,255,255,0.05);
          --primary: #c41e3a;
          --primary-2: #ff3859;
          --accent: #d4af5f;
          --accent-2: #ffd47a;
          --white: #fafafa;
          --gray-300: #a0a0b0;
          --gray-500: #6b6b85;
          --gray-700: #3a3a4a;
          --border: rgba(255,255,255,0.06);
          --border-2: rgba(255,255,255,0.1);
          --success: #10b981;
          --danger: #ef4444;
          --warning: #f59e0b;
          --info: #3b82f6;
          --whatsapp: #25d366;
        }

        html, body { background: var(--bg-0); color: var(--white); min-height: 100vh; }

        .page {
          min-height: 100vh;
          font-family: 'DM Sans', sans-serif;
          padding: 32px 24px;
          position: relative;
          overflow-x: hidden;
        }

        .page::before {
          content: '';
          position: fixed;
          inset: 0;
          background:
            radial-gradient(at 20% 30%, rgba(196,30,58,0.15) 0%, transparent 50%),
            radial-gradient(at 80% 70%, rgba(212,175,95,0.08) 0%, transparent 50%),
            radial-gradient(at 50% 100%, rgba(196,30,58,0.05) 0%, transparent 60%);
          pointer-events: none;
          z-index: 0;
          animation: meshMove 20s ease-in-out infinite;
        }

        @keyframes meshMove {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.1) rotate(2deg); }
        }

        .page::after {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-size: 64px 64px;
          pointer-events: none;
          z-index: 0;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
        }

        .content {
          position: relative;
          z-index: 1;
          max-width: 1320px;
          margin: 0 auto;
        }

        .search-container {
          min-height: 88vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .search-card {
          position: relative;
          background: linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 32px;
          padding: 56px 48px;
          max-width: 480px;
          width: 100%;
          text-align: center;
          box-shadow: 0 0 120px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset;
          animation: fadeUp 0.7s cubic-bezier(0.22,1,0.36,1) both;
        }

        .search-card::before {
          content: '';
          position: absolute;
          top: 0; left: 50%;
          transform: translateX(-50%);
          width: 80%;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--primary), transparent);
          opacity: 0.6;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .logo-orb {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(196,30,58,0.5), rgba(196,30,58,0.05));
          border: 1.5px solid rgba(196,30,58,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 32px;
          position: relative;
          box-shadow: 0 0 80px rgba(196,30,58,0.3), inset 0 0 24px rgba(196,30,58,0.15);
        }

        .logo-orb::after {
          content: '';
          position: absolute;
          inset: -10px;
          border-radius: 50%;
          border: 1px solid rgba(196,30,58,0.15);
          animation: pulse 3s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }

        .logo-orb span { font-size: 40px; }

        .brand {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 34px;
          letter-spacing: -0.8px;
          margin-bottom: 10px;
        }

        .brand span {
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-2) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .tagline {
          font-size: 14px;
          color: var(--gray-500);
          margin-bottom: 44px;
          letter-spacing: 0.5px;
          font-weight: 500;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 24px;
          text-align: left;
        }

        .input-label {
          font-size: 11px;
          color: var(--gray-300);
          text-transform: uppercase;
          letter-spacing: 2px;
          font-weight: 700;
        }

        .search-input {
          width: 100%;
          padding: 20px 24px;
          background: var(--bg-3);
          border: 1.5px solid var(--border);
          border-radius: 16px;
          color: var(--white);
          font-size: 16px;
          font-family: inherit;
          outline: none;
          transition: all 0.3s;
        }

        .search-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 4px rgba(196,30,58,0.12);
          background: var(--bg-2);
        }

        .btn-primary {
          width: 100%;
          padding: 20px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-2) 100%);
          color: white;
          border: none;
          border-radius: 16px;
          font-size: 15px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 8px 32px rgba(196,30,58,0.4), 0 1px 0 rgba(255,255,255,0.15) inset;
          letter-spacing: 0.3px;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(196,30,58,0.5), 0 1px 0 rgba(255,255,255,0.2) inset;
        }

        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .error-msg {
          color: var(--danger);
          font-size: 13px;
          margin-top: -16px;
          margin-bottom: 16px;
          padding: 12px 16px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2);
          border-radius: 10px;
        }

        .admin-link {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid var(--border);
          font-size: 12px;
          color: var(--gray-500);
        }

        .admin-link button {
          background: none;
          border: none;
          color: var(--accent);
          cursor: pointer;
          font-weight: 600;
          text-decoration: underline;
          font-family: inherit;
        }

        .admin-link button:hover { color: var(--accent-2); }

        .dash-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
          padding: 24px 28px;
          background: linear-gradient(135deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 24px;
          backdrop-filter: blur(20px);
          flex-wrap: wrap;
          gap: 16px;
        }

        .dash-greeting h1 {
          font-family: 'Syne', sans-serif;
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -0.5px;
          margin-bottom: 4px;
        }

        .dash-greeting h1 span {
          background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .dash-greeting p {
          color: var(--gray-500);
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .admin-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
          color: #1a1a1a;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .header-actions { display: flex; gap: 10px; align-items: center; }

        .btn-back, .btn-secondary {
          padding: 12px 22px;
          background: var(--surface);
          border: 1px solid var(--border-2);
          color: var(--white);
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .btn-back:hover { background: var(--surface-2); border-color: var(--primary); }
        .btn-secondary:hover { background: var(--surface-2); border-color: var(--accent); }

        .stats-row {
          display: flex;
          gap: 14px;
          margin-bottom: 32px;
          flex-wrap: wrap;
        }

        .stat-pill {
          flex: 1;
          min-width: 180px;
          padding: 18px 24px;
          background: linear-gradient(135deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 18px;
          display: flex;
          align-items: center;
          gap: 16px;
          transition: all 0.3s;
        }

        .stat-pill:hover { border-color: var(--border-2); transform: translateY(-2px); }

        .stat-pill-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
        }

        .stat-pill.clients .stat-pill-icon {
          background: linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(59,130,246,0.05) 100%);
          border: 1px solid rgba(59,130,246,0.2);
        }
        .stat-pill.total .stat-pill-icon {
          background: linear-gradient(135deg, rgba(212,175,95,0.2) 0%, rgba(212,175,95,0.05) 100%);
          border: 1px solid rgba(212,175,95,0.2);
        }
        .stat-pill.active .stat-pill-icon {
          background: linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.05) 100%);
          border: 1px solid rgba(16,185,129,0.2);
        }
        .stat-pill.paused .stat-pill-icon {
          background: linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.05) 100%);
          border: 1px solid rgba(239,68,68,0.2);
        }
        .stat-pill.banned .stat-pill-icon {
          background: linear-gradient(135deg, rgba(220,38,38,0.25) 0%, rgba(220,38,38,0.08) 100%);
          border: 1px solid rgba(220,38,38,0.35);
        }
        .stat-pill.banned.alert {
          border-color: rgba(220,38,38,0.5);
          background: linear-gradient(135deg, rgba(220,38,38,0.08) 0%, rgba(220,38,38,0.02) 100%);
          animation: pulseBan 2.5s ease-in-out infinite;
        }
        @keyframes pulseBan {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.3); }
          50% { box-shadow: 0 0 0 8px rgba(220,38,38,0); }
        }

        .stat-pill-info { flex: 1; min-width: 0; }
        .stat-pill-label {
          font-size: 11px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 700;
          margin-bottom: 4px;
        }
        .stat-pill-value {
          font-family: 'Syne', sans-serif;
          font-size: 28px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.5px;
        }
        .stat-pill.clients .stat-pill-value { color: var(--info); }
        .stat-pill.total .stat-pill-value { color: var(--accent); }
        .stat-pill.active .stat-pill-value { color: var(--success); }
        .stat-pill.paused .stat-pill-value { color: var(--danger); }
        .stat-pill.banned .stat-pill-value { color: #dc2626; }

        /* ============================================
         * PANTALLA "CUENTA BLOQUEADA" — vista cliente cuando banned=true
         * ============================================ */
        .banned-screen {
          min-height: calc(100vh - 60px);
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
        }

        .banned-card {
          max-width: 540px;
          width: 100%;
          background: linear-gradient(180deg, rgba(220,38,38,0.08) 0%, rgba(220,38,38,0.03) 100%);
          border: 2px solid rgba(220,38,38,0.35);
          border-radius: 24px;
          padding: 48px 36px;
          text-align: center;
          box-shadow: 0 25px 80px rgba(220,38,38,0.15);
          animation: bannedAppear 0.5s cubic-bezier(0.22,1,0.36,1) both;
        }

        @keyframes bannedAppear {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .banned-icon {
          font-size: 86px;
          margin-bottom: 8px;
          animation: bannedPulse 1.5s ease-in-out infinite;
        }

        @keyframes bannedPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }

        .banned-title {
          font-family: 'Syne', sans-serif;
          font-size: 38px;
          font-weight: 800;
          color: #dc2626;
          margin: 0 0 12px 0;
          letter-spacing: -0.5px;
          text-shadow: 0 2px 20px rgba(220,38,38,0.3);
        }

        .banned-subtitle {
          font-size: 18px;
          color: var(--white);
          margin: 0 0 24px 0;
          font-weight: 500;
        }

        .banned-info {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 20px;
          margin: 20px 0 28px;
          text-align: left;
        }

        .banned-info p {
          color: var(--gray-400);
          font-size: 14px;
          line-height: 1.6;
          margin: 0;
        }

        .banned-info p + p {
          margin-top: 12px;
        }

        .banned-date {
          color: var(--gray-500) !important;
          font-size: 12px !important;
          font-family: 'JetBrains Mono', monospace;
          padding-top: 12px;
          border-top: 1px dashed rgba(255,255,255,0.1);
        }

        .banned-whatsapp {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 16px 24px;
          background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
          color: white;
          text-decoration: none;
          border-radius: 14px;
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 14px;
          transition: all 0.2s;
          box-shadow: 0 8px 24px rgba(37,211,102,0.3);
        }

        .banned-whatsapp:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(37,211,102,0.4);
        }

        .banned-back {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.15);
          color: var(--gray-400);
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
          width: 100%;
          transition: all 0.2s;
        }

        .banned-back:hover {
          background: rgba(255,255,255,0.05);
          color: var(--white);
          border-color: rgba(255,255,255,0.25);
        }

        @media (max-width: 640px) {
          .banned-card { padding: 36px 22px; }
          .banned-title { font-size: 28px; }
          .banned-subtitle { font-size: 15px; }
          .banned-icon { font-size: 64px; }
        }

        .admin-filter-bar {
          margin-bottom: 24px;
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .admin-filter-bar input {
          flex: 1;
          padding: 16px 22px;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 14px;
          color: var(--white);
          font-size: 14px;
          font-family: inherit;
          outline: none;
          transition: all 0.2s;
        }

        .admin-filter-bar input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 4px rgba(212,175,95,0.1);
        }

        .clients-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 18px;
        }

        .client-card {
          position: relative;
          padding: 24px;
          background: linear-gradient(135deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 22px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.22,1,0.36,1);
          overflow: hidden;
          animation: fadeUp 0.5s ease-out both;
        }

        .client-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 100%;
          height: 3px;
          background: linear-gradient(90deg, var(--primary), var(--accent), transparent);
          opacity: 0.6;
        }

        .client-card:hover {
          transform: translateY(-6px);
          border-color: var(--accent);
          box-shadow: 0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,95,0.2);
        }

        .client-card-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 20px;
        }

        .client-avatar {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Syne', sans-serif;
          font-size: 22px;
          font-weight: 800;
          color: white;
          flex-shrink: 0;
          box-shadow: 0 6px 20px rgba(196,30,58,0.3);
        }

        .client-info { flex: 1; min-width: 0; }

        .client-name {
          font-family: 'Syne', sans-serif;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.3px;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .client-handle {
          font-size: 12px;
          color: var(--gray-500);
          font-family: 'JetBrains Mono', monospace;
        }

        .client-stats {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-bottom: 18px;
        }

        .client-stat {
          padding: 10px 8px;
          background: var(--surface);
          border-radius: 10px;
          text-align: center;
        }

        .client-stat-value {
          font-family: 'Syne', sans-serif;
          font-size: 22px;
          font-weight: 800;
          line-height: 1;
          margin-bottom: 4px;
        }

        .client-stat.total .client-stat-value { color: var(--accent); }
        .client-stat.active .client-stat-value { color: var(--success); }
        .client-stat.paused .client-stat-value { color: var(--danger); }

        .client-stat-label {
          font-size: 9px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 1px;
          font-weight: 700;
        }

        .client-rent {
          margin-bottom: 14px;
          padding: 10px 14px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          font-weight: 600;
        }

        .client-rent.active {
          background: rgba(16,185,129,0.08);
          border: 1px solid rgba(16,185,129,0.2);
          color: var(--success);
        }

        .client-rent.warning {
          background: rgba(245,158,11,0.1);
          border: 1px solid rgba(245,158,11,0.3);
          color: var(--warning);
          animation: clientRentPulse 2s ease-in-out infinite;
        }

        .client-rent.expired {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          color: var(--danger);
          animation: clientRentPulse 1.5s ease-in-out infinite;
        }

        .client-rent.none {
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--gray-500);
        }

        @keyframes clientRentPulse {
          0%, 100% { box-shadow: 0 0 0 0 transparent; }
          50% { box-shadow: 0 0 0 3px currentColor; opacity: 0.95; }
        }

        .client-rent-icon { font-size: 14px; line-height: 1; }
        .client-rent-text {
          flex: 1;
          font-family: 'JetBrains Mono', monospace;
          font-variant-numeric: tabular-nums;
        }

        .client-action {
          width: 100%;
          padding: 12px;
          background: var(--surface-2);
          border: 1px solid var(--border-2);
          color: var(--white);
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .client-card:hover .client-action {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
          border-color: var(--accent);
          color: #1a1a1a;
        }

        .clients-empty {
          grid-column: 1 / -1;
          text-align: center;
          padding: 80px 20px;
          color: var(--gray-500);
          background: var(--bg-2);
          border: 1px dashed var(--border-2);
          border-radius: 24px;
        }

        .posts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 24px;
        }

        .post-card {
          position: relative;
          background: linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border);
          border-radius: 28px;
          overflow: hidden;
          transition: all 0.5s cubic-bezier(0.22,1,0.36,1);
          animation: fadeUp 0.6s ease-out both;
        }

        .post-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 30px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
        }

        .post-card.paused { opacity: 0.92; }

        /* Warning glow en el borde de la card */
        .post-card.warning {
          border-color: rgba(245,158,11,0.4);
          box-shadow: 0 0 0 1px rgba(245,158,11,0.2), 0 0 30px rgba(245,158,11,0.1);
        }

        .pc-mesh {
          position: relative;
          height: 110px;
          background:
            radial-gradient(at 20% 30%, rgba(196,30,58,0.25) 0%, transparent 50%),
            radial-gradient(at 80% 50%, rgba(212,175,95,0.15) 0%, transparent 50%),
            radial-gradient(at 50% 100%, rgba(196,30,58,0.1) 0%, transparent 50%);
          overflow: hidden;
        }

        .post-card.paused .pc-mesh {
          background:
            radial-gradient(at 20% 30%, rgba(239,68,68,0.15) 0%, transparent 50%),
            radial-gradient(at 80% 50%, rgba(107,107,133,0.1) 0%, transparent 50%);
          filter: grayscale(0.3);
        }

        .pc-mesh::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 60%, var(--bg-2) 100%);
        }

        .pc-mesh-content {
          position: relative;
          z-index: 1;
          padding: 20px 24px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          height: 100%;
        }

        .pc-id-block { display: flex; flex-direction: column; }

        .pc-id-tiny {
          font-size: 10px;
          color: var(--gray-300);
          text-transform: uppercase;
          letter-spacing: 2.5px;
          font-weight: 700;
          margin-bottom: 6px;
          opacity: 0.7;
        }

        .pc-id-big {
          font-family: 'JetBrains Mono', monospace;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.5px;
          color: var(--white);
        }

        .pc-id-big .hash { color: var(--gray-500); }

        .pc-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(10px);
          border-radius: 100px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .pc-badge.active { color: var(--success); border: 1px solid rgba(16,185,129,0.3); }
        .pc-badge.paused { color: var(--danger); border: 1px solid rgba(239,68,68,0.3); }

        .pc-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

        .pc-badge.active .pc-badge-dot {
          box-shadow: 0 0 12px currentColor;
          animation: dotPulse 1.5s infinite;
        }

        @keyframes dotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }

        .pc-timer-section {
          padding: 4px 24px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .pc-ring-container {
          position: relative;
          width: 200px;
          height: 200px;
          margin-bottom: 8px;
        }

        .pc-ring-svg { width: 100%; height: 100%; transform: rotate(-90deg); }

        .pc-ring-bg { fill: none; stroke: rgba(255,255,255,0.05); stroke-width: 8; }

        .pc-ring-progress {
          fill: none;
          stroke-width: 8;
          stroke-linecap: round;
          transition: stroke-dashoffset 1s linear;
        }

        .post-card.active .pc-ring-progress { stroke: url(#gradActive); }
        .post-card.paused .pc-ring-progress { stroke: url(#gradPaused); opacity: 0.5; }

        .pc-ring-center {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .pc-time-value {
          font-family: 'Syne', sans-serif;
          font-size: 44px;
          font-weight: 800;
          letter-spacing: -2px;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, var(--white) 0%, var(--gray-300) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .post-card.paused .pc-time-value {
          background: linear-gradient(135deg, var(--gray-500) 0%, var(--gray-700) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .pc-time-divider {
          font-family: 'Syne', sans-serif;
          font-size: 44px;
          font-weight: 800;
          color: var(--gray-700);
          margin: 0 2px;
          animation: blink 1s infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .pc-time-label {
          font-size: 10px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 2px;
          font-weight: 700;
          margin-top: 8px;
        }

        .pc-time-row { display: flex; align-items: flex-end; }

        /* ===== BANNER DE ADVERTENCIA ===== */
        .pc-warning {
          margin: 0 24px 20px;
          padding: 18px;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%);
          border: 1px solid rgba(245,158,11,0.4);
          position: relative;
          overflow: hidden;
          animation: warningPulse 2s ease-in-out infinite;
        }

        @keyframes warningPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.2); }
          50% { box-shadow: 0 0 0 4px rgba(245,158,11,0.08); }
        }

        .pc-warning-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .pc-warning-icon {
          font-size: 18px;
          animation: shake 0.8s ease-in-out infinite;
        }

        @keyframes shake {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-10deg); }
          75% { transform: rotate(10deg); }
        }

        .pc-warning-title {
          font-size: 12px;
          font-weight: 800;
          color: var(--warning);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .pc-warning-text {
          font-size: 12px;
          color: var(--gray-300);
          line-height: 1.5;
          margin-bottom: 14px;
        }

        .pc-warning-text strong { color: var(--white); }

        .pc-warning-btn {
          width: 100%;
          padding: 13px;
          background: linear-gradient(135deg, var(--whatsapp) 0%, #1da851 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 6px 20px rgba(37,211,102,0.3);
        }

        .pc-warning-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 26px rgba(37,211,102,0.45);
        }

        .pc-rent {
          margin: 0 24px 20px;
          padding: 16px 18px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .pc-rent.active {
          background: linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 100%);
          border: 1px solid rgba(16,185,129,0.2);
        }
        .pc-rent.expired {
          background: linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%);
          border: 1px solid rgba(239,68,68,0.2);
        }
        .pc-rent.none {
          background: var(--surface);
          border: 1px solid var(--border);
        }

        .pc-rent-info { display: flex; flex-direction: column; }

        .pc-rent-label {
          font-size: 10px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 700;
          margin-bottom: 2px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .pc-rent-value {
          font-family: 'Syne', sans-serif;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.3px;
        }

        .pc-rent.active .pc-rent-value { color: var(--success); }
        .pc-rent.expired .pc-rent-value { color: var(--danger); }
        .pc-rent.none .pc-rent-value { color: var(--gray-500); font-size: 14px; }

        .pc-rent-actions { display: flex; gap: 6px; }

        .rent-btn {
          padding: 8px 12px;
          background: var(--bg-3);
          border: 1px solid var(--border-2);
          color: var(--white);
          border-radius: 8px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
        }

        .rent-btn:hover { border-color: var(--accent); color: var(--accent); }

        .rent-btn.renew {
          background: linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.05) 100%);
          border-color: rgba(16,185,129,0.3);
          color: var(--success);
        }

        .rent-btn.renew:hover {
          background: linear-gradient(135deg, rgba(16,185,129,0.25) 0%, rgba(16,185,129,0.1) 100%);
        }

        .rent-btn.remove:hover { border-color: var(--danger); color: var(--danger); }

        .pc-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          padding: 0 24px;
          margin-bottom: 20px;
        }

        .pc-meta-cell {
          padding: 14px 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
        }

        .pc-meta-label {
          font-size: 10px;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: 1.2px;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .pc-meta-value {
          font-size: 14px;
          color: var(--white);
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        .pc-actions {
          padding: 0 24px 24px;
          display: grid;
          gap: 10px;
        }

        .pc-actions-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .action-btn {
          padding: 14px 18px;
          border: none;
          border-radius: 14px;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          letter-spacing: 0.3px;
          position: relative;
          overflow: hidden;
        }

        .action-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%);
          opacity: 0;
          transition: opacity 0.2s;
        }

        .action-btn:hover::before { opacity: 1; }

        .btn-pause {
          background: linear-gradient(135deg, var(--danger) 0%, #dc2626 100%);
          color: white;
          box-shadow: 0 6px 20px rgba(239,68,68,0.3), 0 1px 0 rgba(255,255,255,0.15) inset;
        }

        .btn-resume {
          background: linear-gradient(135deg, var(--success) 0%, #059669 100%);
          color: white;
          box-shadow: 0 6px 20px rgba(16,185,129,0.3), 0 1px 0 rgba(255,255,255,0.15) inset;
        }

        .btn-pause:hover, .btn-resume:hover { transform: translateY(-2px); }

        .btn-view {
          background: linear-gradient(135deg, var(--info) 0%, #2563eb 100%);
          color: white;
          box-shadow: 0 6px 20px rgba(59,130,246,0.3), 0 1px 0 rgba(255,255,255,0.15) inset;
        }

        .btn-view:hover { transform: translateY(-2px); }

        .btn-edit {
          background: var(--surface-2);
          color: var(--white);
          border: 1px solid var(--border-2);
        }

        .btn-edit:hover { border-color: var(--accent); color: var(--accent); background: rgba(212,175,95,0.06); }

        /* ===== Estados de edición en la card ===== */
        .edit-status {
          padding: 12px 14px;
          border-radius: 14px;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .edit-status.pending {
          background: linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0.03) 100%);
          border: 1px solid rgba(59,130,246,0.25);
          color: var(--info);
          justify-content: space-between;
        }

        .edit-status.ready {
          flex-direction: column;
          gap: 8px;
          padding: 0;
          background: transparent;
        }

        .edit-status.publishing {
          background: linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(245,158,11,0.03) 100%);
          border: 1px solid rgba(245,158,11,0.3);
          color: var(--warning);
          justify-content: center;
          font-weight: 600;
        }

        .edit-status.applied {
          background: linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.04) 100%);
          border: 1px solid rgba(16,185,129,0.3);
          color: var(--success);
          justify-content: center;
          font-weight: 700;
          font-size: 13px;
        }

        .edit-status.failed {
          background: linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(239,68,68,0.03) 100%);
          border: 1px solid rgba(239,68,68,0.3);
          color: var(--danger);
          font-size: 12px;
          justify-content: center;
        }

        .edit-status-info {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
        }

        .edit-status-spinner {
          font-size: 22px;
          animation: spin 2s linear infinite;
          display: inline-block;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .edit-status-title {
          font-weight: 700;
          font-size: 13px;
          margin-bottom: 2px;
        }

        .edit-status-sub {
          font-size: 11px;
          color: var(--gray-500);
          font-weight: 500;
        }

        .edit-cancel-btn {
          padding: 8px 14px;
          background: var(--surface);
          border: 1px solid var(--border-2);
          color: var(--gray-300);
          border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
        }

        .edit-cancel-btn:hover {
          color: var(--danger);
          border-color: var(--danger);
        }

        .edit-cancel-btn.small {
          width: 100%;
          padding: 10px;
        }

        .btn-edit-ready {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%) !important;
          color: #1a1a1a !important;
          border: none !important;
          font-weight: 800 !important;
          box-shadow: 0 6px 22px rgba(212,175,95,0.4), 0 1px 0 rgba(255,255,255,0.3) inset !important;
          animation: pulseReady 2s ease-in-out infinite;
        }

        @keyframes pulseReady {
          0%, 100% { box-shadow: 0 6px 22px rgba(212,175,95,0.4), 0 1px 0 rgba(255,255,255,0.3) inset; }
          50% { box-shadow: 0 6px 30px rgba(212,175,95,0.7), 0 1px 0 rgba(255,255,255,0.3) inset; }
        }

        /* ===== Modal de edición ===== */
        .edit-modal {
          background: linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border-2);
          border-radius: 24px;
          padding: 32px;
          max-width: 580px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 30px 80px rgba(0,0,0,0.6);
          animation: fadeUp 0.4s cubic-bezier(0.22,1,0.36,1) both;
        }

        .edit-modal-captcha {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 22px;
          background: var(--surface);
          border: 1px solid var(--border-2);
          border-radius: 16px;
          margin-bottom: 22px;
        }

        .edit-modal-captcha img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          background: white;
          padding: 8px;
        }

        .edit-modal-captcha-input {
          width: 100%;
          padding: 14px 18px;
          background: var(--bg-3);
          border: 1.5px solid var(--border-2);
          border-radius: 10px;
          color: var(--white);
          font-size: 16px;
          font-family: 'JetBrains Mono', monospace;
          text-align: center;
          letter-spacing: 4px;
          font-weight: 700;
          text-transform: uppercase;
          outline: none;
        }

        .edit-modal-captcha-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(212,175,95,0.15);
        }

        .edit-modal-timer {
          font-size: 12px;
          color: var(--warning);
          font-weight: 700;
          padding: 6px 12px;
          background: rgba(245,158,11,0.1);
          border: 1px solid rgba(245,158,11,0.3);
          border-radius: 100px;
        }

        .edit-modal-section {
          margin-bottom: 18px;
        }

        .edit-modal-section-title {
          font-size: 11px;
          color: var(--gray-300);
          text-transform: uppercase;
          letter-spacing: 2px;
          font-weight: 700;
          margin-bottom: 14px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border);
        }

        .edit-modal-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }

        .edit-modal-field {
          display: flex;
          flex-direction: column;
        }

        .edit-modal-field.full { grid-column: 1 / -1; }

        .edit-modal-field label {
          font-size: 11px;
          color: var(--gray-500);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 6px;
        }

        .edit-modal-field input, .edit-modal-field textarea {
          padding: 12px 14px;
          background: var(--bg-3);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--white);
          font-family: inherit;
          font-size: 14px;
          outline: none;
          transition: all 0.2s;
        }

        .edit-modal-field input:focus, .edit-modal-field textarea:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(212,175,95,0.1);
        }

        .edit-modal-field textarea {
          min-height: 120px;
          resize: vertical;
          font-family: inherit;
        }

        /* ===== Selector de City (botón que abre el modal) ===== */
        .city-selector-btn {
          padding: 12px 14px;
          background: var(--bg-3);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--white);
          font-family: inherit;
          font-size: 14px;
          outline: none;
          cursor: pointer;
          text-align: left;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s;
        }

        .city-selector-btn:hover {
          border-color: var(--accent);
        }

        .city-placeholder {
          color: var(--gray-500);
        }

        .city-selected {
          color: var(--white);
        }

        .city-selector-arrow {
          color: var(--gray-500);
          font-size: 11px;
        }

        /* ===== Modal de selección de ubicación (estilo MegaPersonals) ===== */
        .location-modal {
          background: white;
          border-radius: 16px;
          padding: 24px 18px 18px 18px;
          max-width: 380px;
          width: 92%;
          max-height: 85vh;
          overflow-y: auto;
          box-shadow: 0 25px 80px rgba(0,0,0,0.5);
          position: relative;
          animation: fadeUp 0.3s cubic-bezier(0.22,1,0.36,1) both;
        }

        .location-close-btn {
          position: absolute;
          top: -14px;
          right: -14px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #5a5a5a;
          color: white;
          border: 3px solid white;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          font-family: inherit;
        }

        .location-close-btn:hover {
          background: #ef4444;
        }

        .location-title {
          color: #4FC3F7;
          font-size: 22px;
          font-weight: 800;
          text-align: center;
          margin-bottom: 18px;
          letter-spacing: 0.5px;
        }

        /* Botón naranja "United States" - estilo MegaPersonals */
        .location-region-btn {
          width: 100%;
          padding: 14px 18px;
          background: linear-gradient(180deg, #F5A623 0%, #E89714 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 17px;
          font-weight: 700;
          text-align: left;
          cursor: default;
          margin-bottom: 8px;
          font-family: inherit;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        }

        .location-states-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .location-state-group {
          display: flex;
          flex-direction: column;
        }

        /* Botones azul claro de los estados */
        .location-state-btn {
          width: 100%;
          padding: 13px 18px;
          background: linear-gradient(180deg, #4FC3F7 0%, #29B6F6 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 700;
          text-align: left;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: filter 0.15s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.08);
        }

        .location-state-btn:hover {
          filter: brightness(1.08);
        }

        .location-state-btn.expanded {
          background: linear-gradient(180deg, #81D4FA 0%, #4FC3F7 100%);
        }

        .location-state-icon {
          font-size: 22px;
          line-height: 1;
          font-weight: 400;
          opacity: 0.95;
        }

        /* Lista de ciudades de un estado expandido */
        .location-cities-list {
          display: flex;
          flex-direction: column;
          padding: 4px 0 4px 24px;
          background: rgba(79,195,247,0.04);
          border-left: 3px solid #4FC3F7;
          margin: 2px 0 4px 12px;
          border-radius: 0 8px 8px 0;
        }

        .location-city-btn {
          padding: 9px 14px;
          background: transparent;
          border: none;
          color: #333;
          font-size: 14px;
          text-align: left;
          cursor: pointer;
          font-family: inherit;
          border-radius: 6px;
          transition: all 0.15s;
          font-weight: 500;
        }

        .location-city-btn:hover {
          background: rgba(79,195,247,0.15);
          color: #0277BD;
          padding-left: 18px;
        }

        /* ============================================
         * MODAL MEGAPERSONALS 1:1 — réplica exacta del estilo Candy Crush
         * ============================================ */
        .mp-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.7);
          z-index: 9999;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 20px;
          overflow-y: auto;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .mp-modal {
          position: relative;
          width: 100%;
          max-width: 600px;
          background: linear-gradient(rgb(253, 52, 171) 0%, rgb(255, 255, 255) 100%);
          padding: 21px 0;
          font-family: Arial, "sans serif";
          font-size: 14px;
          color: #333;
          box-shadow: 0 25px 80px rgba(0,0,0,0.5);
          margin: 20px 0;
          animation: mpSlide 0.4s cubic-bezier(0.22,1,0.36,1) both;
        }

        @keyframes mpSlide {
          from { transform: translateY(-30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .mp-close-x {
          position: absolute;
          top: -15px;
          right: -15px;
          width: 50px;
          height: 50px;
          border: none;
          background: transparent;
          cursor: pointer;
          padding: 0;
          z-index: 10;
        }

        .mp-close-x img {
          width: 100%;
          height: 100%;
        }

        .mp-timer {
          position: absolute;
          top: 10px;
          left: 10px;
          background: rgba(255,255,255,0.95);
          color: #d63384;
          padding: 6px 14px;
          border-radius: 100px;
          font-size: 13px;
          font-weight: 700;
          box-shadow: 0 3px 10px rgba(0,0,0,0.2);
          z-index: 5;
          font-family: 'JetBrains Mono', monospace;
          font-variant-numeric: tabular-nums;
        }

        /* Bordes decorativos rosa (4 lados) */
        .mp-topborder,
        .mp-bottomborder,
        .mp-leftborder,
        .mp-rightborder {
          position: absolute;
          pointer-events: none;
          background-repeat: repeat;
        }
        .mp-topborder {
          top: 0; left: 0; right: 0;
          height: 21px;
          background-image: url("/megapersonals-img/topborder.png");
          background-repeat: repeat-x;
        }
        .mp-bottomborder {
          bottom: 0; left: 0; right: 0;
          height: 21px;
          background-image: url("/megapersonals-img/bottomborder.png");
          background-repeat: repeat-x;
        }
        .mp-leftborder {
          top: 21px; bottom: 21px; left: 0;
          width: 21px;
          background-image: url("/megapersonals-img/leftborder.png");
          background-repeat: repeat-y;
        }
        .mp-rightborder {
          top: 21px; bottom: 21px; right: 0;
          width: 21px;
          background-image: url("/megapersonals-img/rightborder.png");
          background-repeat: repeat-y;
        }

        .mp-header-logo {
          text-align: center;
          padding: 20px 20px 10px;
          position: relative;
          z-index: 2;
        }
        .mp-header-logo img {
          max-width: 90%;
          height: auto;
        }

        .mp-stage {
          padding: 0 20px;
          position: relative;
          z-index: 2;
        }

        .mp-banner {
          text-align: center;
          margin-bottom: 10px;
        }
        .mp-banner img {
          max-width: 100%;
          height: auto;
        }

        .mp-form {
          width: 100%;
        }

        .mp-row {
          display: flex;
          gap: 12px;
          margin-bottom: 14px;
        }

        .mp-row-2 > .mp-field {
          flex: 1;
        }

        .mp-field {
          display: flex;
          flex-direction: column;
        }

        .mp-field-full {
          flex: 1;
          width: 100%;
        }

        .mp-label {
          color: rgba(248, 208, 7, 0.91); /* amarillo MegaPersonals */
          font-family: Helvetica, Arial, sans-serif;
          font-size: 16px;
          font-weight: 600;
          font-style: italic;
          margin-bottom: 5px;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.15);
        }

        .mp-input {
          background: #fff;
          border: 2px solid rgb(136, 136, 136);
          border-radius: 5px;
          padding: 6px 12px;
          font-family: Arial, "sans serif";
          font-size: 14px;
          color: #333;
          width: 100%;
          height: 34px;
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.15s;
        }

        .mp-input:focus {
          border-color: #d63384;
        }

        .mp-input.mp-disabled {
          background: rgb(238, 238, 238);
          color: #666;
          cursor: not-allowed;
        }

        .mp-textarea {
          height: 200px !important;
          padding: 8px 12px;
          resize: vertical;
          font-family: Arial, "sans serif";
        }

        .mp-city-btn {
          text-align: left;
          cursor: pointer;
          background: #fff;
        }
        .mp-city-btn:hover {
          border-color: #d63384;
        }

        .mp-phone-wrapper {
          display: flex;
          gap: 4px;
        }
        .mp-phone-code {
          width: 70px !important;
          flex-shrink: 0;
          text-align: center;
        }
        .mp-phone-number {
          flex: 1;
        }

        .mp-button-row {
          text-align: center;
          margin: 30px 0 10px;
        }

        .mp-btn-next {
          width: 130px;
          height: 60px;
          background-image: url("/megapersonals-img/button_next.png");
          background-size: 100% 100%;
          background-repeat: no-repeat;
          background-color: transparent;
          border: none;
          cursor: pointer;
          color: white;
          font-size: 18px;
          padding: 0;
          transition: transform 0.1s;
        }
        .mp-btn-next:hover {
          transform: scale(1.05);
        }
        .mp-btn-next:active {
          transform: scale(0.97);
        }

        .mp-cancel-row {
          text-align: center;
          margin: 15px 0 5px;
        }

        .mp-cancel {
          background: rgba(255,255,255,0.6);
          border: 1px solid rgba(0,0,0,0.15);
          color: #666;
          padding: 8px 18px;
          border-radius: 100px;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
        }
        .mp-cancel:hover {
          background: white;
          color: #d63384;
        }
        .mp-cancel:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* ========== Pestaña 2: Photos + Videos + Captcha ========== */
        .mp-section-locked {
          margin-bottom: 24px;
          position: relative;
        }

        .mp-section-title {
          color: rgba(248, 208, 7, 0.91);
          font-family: Helvetica, Arial, sans-serif;
          font-size: 16px;
          font-weight: 700;
          font-style: italic;
          margin-bottom: 10px;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
        }

        .mp-letter {
          display: inline-block;
          width: 28px;
          height: 28px;
          line-height: 28px;
          background: #4FC3F7;
          color: white;
          border-radius: 50%;
          text-align: center;
          font-weight: bold;
          font-style: normal;
          margin-right: 8px;
          font-family: Arial, sans-serif;
          font-size: 16px;
        }
        .mp-letter-c {
          background: #FFA726;
        }

        .mp-locked-content {
          position: relative;
          padding: 15px;
          background: rgba(255,255,255,0.6);
          border: 2px dashed rgba(214, 51, 132, 0.4);
          border-radius: 10px;
        }

        .mp-locked-msg {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(214, 51, 132, 0.95);
          color: white;
          padding: 14px 24px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          text-align: center;
          z-index: 5;
          box-shadow: 0 6px 20px rgba(0,0,0,0.3);
          white-space: nowrap;
        }

        .mp-locked-sub {
          font-size: 11px;
          font-weight: 400;
          opacity: 0.9;
          margin-top: 4px;
          white-space: normal;
          max-width: 250px;
        }

        .mp-photos-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          opacity: 0.4;
          pointer-events: none;
        }

        .mp-videos-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          opacity: 0.4;
          pointer-events: none;
        }

        .mp-photo-cell {
          aspect-ratio: 1 / 1;
          background: #ddd;
          border-radius: 4px;
          overflow: hidden;
        }
        .mp-photo-cell img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        /* Captcha */
        .mp-captcha-section {
          margin: 24px 0;
          padding: 18px;
          background: rgba(255,255,255,0.7);
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .mp-captcha-image-wrapper {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .mp-captcha-image {
          background: white;
          padding: 4px;
          border-radius: 4px;
          max-width: 100%;
          height: auto;
        }

        .mp-captcha-reload {
          width: 40px;
          height: 40px;
          opacity: 0.5;
          cursor: not-allowed;
        }
        .mp-captcha-reload img {
          width: 100%;
          height: 100%;
        }

        .mp-captcha-input {
          max-width: 320px;
          text-align: center;
          font-size: 16px !important;
          letter-spacing: 3px;
          font-weight: 700;
          text-transform: uppercase;
        }

        /* Botones Back y Publish */
        .mp-buttons-final {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 30px 20px 10px;
        }

        .mp-btn-back {
          width: 90px;
          height: 45px;
          background-image: url("/megapersonals-img/button_back.png");
          background-size: 100% 100%;
          background-repeat: no-repeat;
          background-color: transparent;
          border: none;
          cursor: pointer;
          padding: 0;
          transition: transform 0.1s;
        }
        .mp-btn-back:hover { transform: scale(1.05); }
        .mp-btn-back:active { transform: scale(0.97); }
        .mp-btn-back:disabled { opacity: 0.5; cursor: not-allowed; }

        .mp-btn-publish {
          width: 150px;
          height: 60px;
          background-image: url("/megapersonals-img/button_publish.png");
          background-size: 100% 100%;
          background-repeat: no-repeat;
          background-color: transparent;
          border: none;
          cursor: pointer;
          padding: 0;
          transition: transform 0.1s;
        }
        .mp-btn-publish:hover { transform: scale(1.05); }
        .mp-btn-publish:active { transform: scale(0.97); }
        .mp-btn-publish:disabled { opacity: 0.6; cursor: not-allowed; }

        /* MOBILE: adaptar para pantallas pequeñas */
        @media (max-width: 640px) {
          .mp-modal {
            margin: 10px 0;
            padding: 15px 0;
          }
          .mp-stage {
            padding: 0 14px;
          }
          .mp-row-2 {
            flex-direction: column;
          }
          .mp-photos-grid,
          .mp-videos-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .mp-locked-msg {
            font-size: 13px;
            padding: 10px 14px;
            white-space: normal;
            max-width: 80%;
          }
          .mp-buttons-final {
            margin: 24px 10px 10px;
          }
          .mp-close-x {
            width: 40px;
            height: 40px;
            top: -10px;
            right: -10px;
          }
          .mp-timer {
            font-size: 11px;
            padding: 5px 10px;
          }
        }

        .empty-state {
          grid-column: 1 / -1;
          text-align: center;
          padding: 100px 20px;
          color: var(--gray-500);
          background: var(--bg-2);
          border: 1px dashed var(--border-2);
          border-radius: 28px;
        }

        .empty-state-icon { font-size: 64px; margin-bottom: 24px; }
        .empty-state-text { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: var(--white); }
        .empty-state-sub { font-size: 14px; }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(10px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal-card {
          background: linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border: 1px solid var(--border-2);
          border-radius: 24px;
          padding: 36px 32px;
          max-width: 420px;
          width: 100%;
          box-shadow: 0 30px 80px rgba(0,0,0,0.6);
          animation: fadeUp 0.4s cubic-bezier(0.22,1,0.36,1) both;
        }

        .modal-title {
          font-family: 'Syne', sans-serif;
          font-size: 24px;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .modal-subtitle {
          font-size: 13px;
          color: var(--gray-500);
          margin-bottom: 28px;
        }

        .modal-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 24px;
        }

        .modal-field { display: flex; flex-direction: column; }
        .modal-field label {
          font-size: 11px;
          color: var(--gray-300);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .modal-field input {
          padding: 16px 20px;
          background: var(--bg-3);
          border: 1.5px solid var(--border);
          border-radius: 12px;
          color: var(--white);
          font-size: 18px;
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          text-align: center;
          outline: none;
          transition: all 0.2s;
        }

        .modal-field input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 4px rgba(212,175,95,0.12);
        }

        .modal-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .modal-btn {
          padding: 16px;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
        }

        .modal-btn-primary {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
          color: #1a1a1a;
          box-shadow: 0 6px 20px rgba(212,175,95,0.3);
        }

        .modal-btn-primary:hover { transform: translateY(-2px); }

        .modal-btn-secondary {
          background: var(--surface-2);
          color: var(--white);
          border: 1px solid var(--border-2);
        }

        .modal-btn-secondary:hover { background: var(--bg-3); }

        @media (max-width: 640px) {
          .page { padding: 20px 16px; }
          .dash-header { flex-direction: column; align-items: flex-start; padding: 20px; }
          .dash-greeting h1 { font-size: 24px; }
          .posts-grid, .clients-grid { grid-template-columns: 1fr; gap: 16px; }
          .pc-ring-container { width: 180px; height: 180px; }
          .pc-time-value, .pc-time-divider { font-size: 38px; }
          .stat-pill { min-width: 100%; }
          .pc-rent { flex-direction: column; align-items: flex-start; }
          .pc-rent-actions { width: 100%; }
          .rent-btn { flex: 1; justify-content: center; }
        }
      `}</style>

      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="gradActive" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#d4af5f" />
            <stop offset="100%" stopColor="#c41e3a" />
          </linearGradient>
          <linearGradient id="gradPaused" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#6b6b85" />
          </linearGradient>
        </defs>
      </svg>

      <div className="page">
        <div className="content">
          {step === "search" && (
            <div className="search-container">
              <div className="search-card">
                <div className="logo-orb">
                  <span>🔍</span>
                </div>

                <div className="brand">
                  Angel<span>Vercel</span>
                </div>
                <div className="tagline">Panel premium de control</div>

                <div className="input-group">
                  <label className="input-label">Nombre del cliente</label>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Ej: Carla, María, Sofía..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && searchClient()}
                    autoFocus
                  />
                </div>

                {error && <div className="error-msg">{error}</div>}

                <button className="btn-primary" onClick={searchClient} disabled={loading}>
                  {loading ? "Buscando..." : "Acceder al panel"}
                </button>

                <div className="admin-link">
                  <button onClick={() => setShowAdminLogin(true)}>🔐 Acceso administrador</button>
                </div>
              </div>
            </div>
          )}

          {step === "admin-list" && isAdmin && (
            <div>
              <div className="dash-header">
                <div className="dash-greeting">
                  <h1>
                    Panel <span>Administrador</span>
                  </h1>
                  <p>
                    Lista completa de clientes
                    <span className="admin-badge">⚡ ADMIN</span>
                  </p>
                </div>
                <div className="header-actions">
                  <button className="btn-secondary" onClick={loadAllClients}>
                    🔄 Actualizar
                  </button>
                  <button className="btn-back" onClick={logoutAdmin}>
                    🔓 Salir
                  </button>
                </div>
              </div>

              {(() => {
                const stats = getGlobalStats();
                return (
                  <div className="stats-row">
                    <div className="stat-pill clients">
                      <div className="stat-pill-icon">👥</div>
                      <div className="stat-pill-info">
                        <div className="stat-pill-label">Clientes</div>
                        <div className="stat-pill-value">{stats.totalClients}</div>
                      </div>
                    </div>
                    <div className="stat-pill total">
                      <div className="stat-pill-icon">📊</div>
                      <div className="stat-pill-info">
                        <div className="stat-pill-label">Publicaciones</div>
                        <div className="stat-pill-value">{stats.totalPosts}</div>
                      </div>
                    </div>
                    <div className="stat-pill active">
                      <div className="stat-pill-icon">✨</div>
                      <div className="stat-pill-info">
                        <div className="stat-pill-label">Activas</div>
                        <div className="stat-pill-value">{stats.activePosts}</div>
                      </div>
                    </div>
                    <div className="stat-pill paused">
                      <div className="stat-pill-icon">⏸️</div>
                      <div className="stat-pill-info">
                        <div className="stat-pill-label">Pausadas</div>
                        <div className="stat-pill-value">{stats.pausedPosts}</div>
                      </div>
                    </div>
                    <div className={`stat-pill banned ${baneosEstaSemana > 0 ? "alert" : ""}`}>
                      <div className="stat-pill-icon">🚫</div>
                      <div className="stat-pill-info">
                        <div className="stat-pill-label">Baneos esta semana</div>
                        <div className="stat-pill-value">{baneosEstaSemana}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="admin-filter-bar">
                <input
                  type="text"
                  placeholder="🔍 Filtrar clientes por nombre..."
                  value={adminFilter}
                  onChange={(e) => setAdminFilter(e.target.value)}
                />
              </div>

              <div className="clients-grid">
                {filteredClients.length === 0 ? (
                  <div className="clients-empty">
                    <div style={{ fontSize: 56, marginBottom: 20 }}>📭</div>
                    <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, color: "var(--white)" }}>
                      {Object.keys(allClients).length === 0 ? "Sin clientes" : "Sin resultados"}
                    </div>
                    <div style={{ fontSize: 14 }}>
                      {Object.keys(allClients).length === 0
                        ? "Aún no hay clientes registrados"
                        : "Intenta con otro nombre"}
                    </div>
                  </div>
                ) : (
                  filteredClients.map(([key, data]) => {
                    const posts = data.posts ? Object.values(data.posts) : [];
                    const total = posts.length;
                    const active = posts.filter((p) => p.status === "active").length;
                    const paused = posts.filter((p) => p.status === "paused").length;
                    const initial = (data.displayName || key).charAt(0).toUpperCase();

                    // Estado de renta agregado del cliente
                    const postsConRenta = posts.filter((p) => p.rentExpiresAt);
                    let rentSummary: { type: "expired" | "warning" | "active" | "none"; text: string; count?: number } = {
                      type: "none",
                      text: "Sin renta",
                    };

                    if (postsConRenta.length > 0) {
                      const expired = postsConRenta.filter((p) => p.rentExpiresAt! <= now);
                      const activeRent = postsConRenta.filter((p) => p.rentExpiresAt! > now);
                      const warning = activeRent.filter((p) => p.rentExpiresAt! - now <= 24 * 60 * 60 * 1000);

                      if (expired.length > 0) {
                        // Tomar la deuda más grande (más urgente)
                        const maxDebt = Math.max(...expired.map((p) => now - p.rentExpiresAt!));
                        const debtDays = Math.floor(maxDebt / (24 * 60 * 60 * 1000));
                        const debtHours = Math.floor((maxDebt % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                        rentSummary = {
                          type: "expired",
                          text: `${expired.length} en deuda · ${debtDays}d ${debtHours}h`,
                          count: expired.length,
                        };
                      } else if (warning.length > 0) {
                        // Tomar el que vence más pronto
                        const minTime = Math.min(...warning.map((p) => p.rentExpiresAt! - now));
                        const totalHours = Math.floor(minTime / (60 * 60 * 1000));
                        const h = totalHours;
                        const m = Math.floor((minTime % (60 * 60 * 1000)) / (60 * 1000));
                        rentSummary = {
                          type: "warning",
                          text: `${warning.length} por vencer · ${h}h ${m}m`,
                          count: warning.length,
                        };
                      } else if (activeRent.length > 0) {
                        // Tomar el que vence más pronto entre los activos
                        const minTime = Math.min(...activeRent.map((p) => p.rentExpiresAt! - now));
                        const totalHours = Math.floor(minTime / (60 * 60 * 1000));
                        const days = Math.floor(totalHours / 24);
                        const hours = totalHours % 24;
                        rentSummary = {
                          type: "active",
                          text: `Próximo: ${days}d ${hours}h`,
                        };
                      }
                    }

                    return (
                      <div key={key} className="client-card" onClick={() => selectClient(key, data)}>
                        <div className="client-card-header">
                          <div className="client-avatar">{initial}</div>
                          <div className="client-info">
                            <div className="client-name">{data.displayName || key}</div>
                            <div className="client-handle">@{key}</div>
                          </div>
                        </div>

                        <div className="client-stats">
                          <div className="client-stat total">
                            <div className="client-stat-value">{total}</div>
                            <div className="client-stat-label">Total</div>
                          </div>
                          <div className="client-stat active">
                            <div className="client-stat-value">{active}</div>
                            <div className="client-stat-label">Activas</div>
                          </div>
                          <div className="client-stat paused">
                            <div className="client-stat-value">{paused}</div>
                            <div className="client-stat-label">Pausadas</div>
                          </div>
                        </div>

                        {/* Estado de renta del cliente */}
                        <div className={`client-rent ${rentSummary.type}`}>
                          <span className="client-rent-icon">
                            {rentSummary.type === "expired" ? "🔴" :
                             rentSummary.type === "warning" ? "🟡" :
                             rentSummary.type === "active" ? "🟢" : "⚪"}
                          </span>
                          <span className="client-rent-text">{rentSummary.text}</span>
                        </div>

                        <button className="client-action">Abrir panel →</button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {step === "cards" && clientData && clientData.banned && !isAdmin && (
            <div className="banned-screen">
              <div className="banned-card">
                <div className="banned-icon">🚫</div>
                <h1 className="banned-title">CUENTA BLOQUEADA</h1>
                <p className="banned-subtitle">
                  Tu cuenta de MegaPersonals fue bloqueada por la plataforma.
                </p>
                <div className="banned-info">
                  <p>
                    Esto puede deberse a actividad detectada como inusual o a una violación de las
                    políticas de MegaPersonals. Tu publicación NO está activa en este momento.
                  </p>
                  {clientData.bannedAt && (
                    <p className="banned-date">
                      Detectado: {new Date(clientData.bannedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <a
                  className="banned-whatsapp"
                  href={`https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(
                    `Hola Angel, mi cuenta (${clientData.displayName}) aparece como BLOQUEADA. ¿Qué puedo hacer?`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span style={{ fontSize: 22 }}>💬</span> Contactar con Angel
                </a>
                <button
                  className="banned-back"
                  onClick={goBack}
                >
                  ← Volver al inicio
                </button>
              </div>
            </div>
          )}

          {step === "cards" && clientData && !(clientData.banned && !isAdmin) && (
            <div>
              <div className="dash-header">
                <div className="dash-greeting">
                  <h1>
                    {isAdmin ? "Panel de" : "Hola,"} <span>{clientData.displayName}</span>
                  </h1>
                  <p>
                    Control de publicaciones
                    {isAdmin && <span className="admin-badge">⚡ ADMIN</span>}
                  </p>
                </div>
                <div className="header-actions">
                  <button className="btn-back" onClick={goBack}>
                    ← {isAdmin ? "Volver a lista" : "Cerrar sesión"}
                  </button>
                </div>
              </div>

              <div className="stats-row">
                <div className="stat-pill total">
                  <div className="stat-pill-icon">📊</div>
                  <div className="stat-pill-info">
                    <div className="stat-pill-label">Total</div>
                    <div className="stat-pill-value">{Object.keys(clientData.posts || {}).length}</div>
                  </div>
                </div>
                <div className="stat-pill active">
                  <div className="stat-pill-icon">✨</div>
                  <div className="stat-pill-info">
                    <div className="stat-pill-label">Activas</div>
                    <div className="stat-pill-value">
                      {Object.values(clientData.posts || {}).filter((p) => p.status === "active").length}
                    </div>
                  </div>
                </div>
                <div className="stat-pill paused">
                  <div className="stat-pill-icon">⏸️</div>
                  <div className="stat-pill-info">
                    <div className="stat-pill-label">Pausadas</div>
                    <div className="stat-pill-value">
                      {Object.values(clientData.posts || {}).filter((p) => p.status === "paused").length}
                    </div>
                  </div>
                </div>
              </div>

              <div className="posts-grid">
                {Object.entries(clientData.posts || {}).length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">📭</div>
                    <div className="empty-state-text">Sin publicaciones</div>
                    <div className="empty-state-sub">Aún no hay publicaciones registradas</div>
                  </div>
                ) : (
                  Object.entries(clientData.posts).map(([postId, post]) => {
                    const isPaused = post.status === "paused";
                    const time = formatTime(post.nextBumpAt);
                    const progress = isPaused ? 0 : getProgress(post);
                    const rent = getRentInfo(post);

                    const radius = 90;
                    const circumference = 2 * Math.PI * radius;
                    const offset = circumference - (progress / 100) * circumference;

                    return (
                      <div
                        key={postId}
                        className={`post-card ${isPaused ? "paused" : "active"} ${rent.isWarning || rent.status === "expired" ? "warning" : ""}`}
                      >
                        <div className="pc-mesh">
                          <div className="pc-mesh-content">
                            <div className="pc-id-block">
                              <div className="pc-id-tiny">Publicación</div>
                              <div className="pc-id-big">
                                <span className="hash">#</span>
                                {postId}
                              </div>
                            </div>
                            <span className={`pc-badge ${isPaused ? "paused" : "active"}`}>
                              <span className="pc-badge-dot"></span>
                              {isPaused ? "Pausado" : "En vivo"}
                            </span>
                          </div>
                        </div>

                        <div className="pc-timer-section">
                          <div className="pc-ring-container">
                            <svg className="pc-ring-svg" viewBox="0 0 200 200">
                              <circle className="pc-ring-bg" cx="100" cy="100" r={radius} />
                              <circle
                                className="pc-ring-progress"
                                cx="100"
                                cy="100"
                                r={radius}
                                strokeDasharray={circumference}
                                strokeDashoffset={offset}
                              />
                            </svg>
                            <div className="pc-ring-center">
                              {isPaused ? (
                                <>
                                  <div className="pc-time-value">⏸</div>
                                  <div className="pc-time-label">Pausado</div>
                                </>
                              ) : (
                                <>
                                  <div className="pc-time-row">
                                    <span className="pc-time-value">{time.mins}</span>
                                    <span className="pc-time-divider">:</span>
                                    <span className="pc-time-value">{time.secs}</span>
                                  </div>
                                  <div className="pc-time-label">Próximo bump</div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* BANNER - cuando queda 1 día o menos, O cuando ya venció (en deuda) */}
                        {(rent.isWarning || rent.status === "expired") && (
                          <div className="pc-warning">
                            <div className="pc-warning-header">
                              <span className="pc-warning-icon">⚠️</span>
                              <span className="pc-warning-title">
                                {rent.status === "expired" ? "Renta vencida" : "Advertencia"}
                              </span>
                            </div>
                            <div className="pc-warning-text">
                              {rent.status === "expired" ? (
                                <>
                                  Este post está <strong>pausado</strong> porque la renta llegó a 0. El tiempo sigue
                                  corriendo como <strong>deuda ({rent.debtDays}d {rent.debtHours}h)</strong>. Al renovar
                                  se descontará ese tiempo. Contacta con <strong>Angel</strong> por WhatsApp.
                                </>
                              ) : (
                                <>
                                  Este post se <strong>pausará automáticamente</strong> cuando el tiempo de renta
                                  llegue a 0, y el tiempo seguirá corriendo como <strong>deuda</strong>. Para reactivarlo,
                                  contacta con <strong>Angel</strong> por WhatsApp y renueva.
                                </>
                              )}
                            </div>
                            <button className="pc-warning-btn" onClick={() => renovarWhatsApp(postId)}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.522l4.625-1.476A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.7 9.7 0 01-5.226-1.526l-.375-.237-3.872 1.013 1.035-3.776-.244-.388A9.71 9.71 0 012.25 12c0-5.385 4.365-9.75 9.75-9.75S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                              </svg>
                              Renovar por WhatsApp
                            </button>
                          </div>
                        )}

                        <div className={`pc-rent ${rent.status}`}>
                          <div className="pc-rent-info">
                            <div className="pc-rent-label">
                              🎫 {rent.status === "active" ? "Renta activa" : rent.status === "expired" ? "Renta vencida" : "Sin renta"}
                            </div>
                            <div className="pc-rent-value">
                              {rent.status === "active"
                                ? `${rent.days}d ${rent.hours}h restantes`
                                : rent.status === "expired"
                                ? `En deuda: ${rent.debtDays}d ${rent.debtHours}h`
                                : "No establecida"}
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="pc-rent-actions">
                              <button className="rent-btn renew" onClick={() => renovarRenta(postId)} title="Agregar 7 días">
                                +7d
                              </button>
                              <button className="rent-btn" onClick={() => abrirModalRenta(postId)} title="Establecer renta">
                                ⚙
                              </button>
                              {rent.status !== "none" && (
                                <button className="rent-btn remove" onClick={() => quitarRenta(postId)} title="Quitar renta">
                                  ✕
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="pc-meta-grid">
                          <div className="pc-meta-cell">
                            <div className="pc-meta-label">Último bump</div>
                            <div className="pc-meta-value">
                              {post.lastBumpAt
                                ? new Date(post.lastBumpAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "—"}
                            </div>
                          </div>
                          <div className="pc-meta-cell">
                            <div className="pc-meta-label">Registrado</div>
                            <div className="pc-meta-value">
                              {new Date(post.addedAt).toLocaleDateString([], { day: "2-digit", month: "short" })}
                            </div>
                          </div>
                        </div>

                        <div className="pc-actions">
                          <div className="pc-actions-row">
                            <button
                              className={`action-btn ${isPaused ? "btn-resume" : "btn-pause"}`}
                              onClick={() => togglePostStatus(postId, post.status)}
                            >
                              {isPaused ? "▶ Reanudar" : "⏸ Pausar"}
                            </button>
                            <button className="action-btn btn-view" onClick={() => verAnuncio(postId)}>
                              👁 Ver anuncio
                            </button>
                          </div>

                          {/* Botón de Editar dinámico según estado de la solicitud */}
                          {(() => {
                            const er = post.editRequest;
                            if (!er || er.status === "aplicada" || er.status === "fallida") {
                              return (
                                <button className="action-btn btn-edit" onClick={() => iniciarEdicion(postId)}>
                                  ✏ Editar publicación
                                </button>
                              );
                            }

                            if (er.status === "captcha_pendiente") {
                              return (
                                <div className="edit-status pending">
                                  <div className="edit-status-info">
                                    <span className="edit-status-spinner">🔄</span>
                                    <div>
                                      <div className="edit-status-title">Generando captcha...</div>
                                      <div className="edit-status-sub">Esperando turno del sistema (1-15 min)</div>
                                    </div>
                                  </div>
                                  <button className="edit-cancel-btn" onClick={() => cancelarEdicion(postId)}>
                                    Cancelar
                                  </button>
                                </div>
                              );
                            }

                            if (er.status === "captcha_listo") {
                              const minRestantes = er.expiresAt
                                ? Math.max(0, Math.ceil((er.expiresAt - now) / 60000))
                                : 0;
                              return (
                                <div className="edit-status ready">
                                  <button className="action-btn btn-edit-ready" onClick={() => abrirFormularioEdicion(postId)}>
                                    🔐 Editar ahora ({minRestantes}min)
                                  </button>
                                  <button className="edit-cancel-btn small" onClick={() => cancelarEdicion(postId)}>
                                    Cancelar
                                  </button>
                                </div>
                              );
                            }

                            if (er.status === "listo_para_publicar") {
                              return (
                                <div className="edit-status publishing">
                                  <span className="edit-status-spinner">⏳</span>
                                  <span>Publicando cambios...</span>
                                </div>
                              );
                            }

                            return null;
                          })()}

                          {/* Mensaje breve cuando ya se aplicó o falló */}
                          {post.editRequest?.status === "aplicada" && (
                            <div className="edit-status applied">✅ Cambios aplicados</div>
                          )}
                          {post.editRequest?.status === "fallida" && (
                            <div className="edit-status failed">
                              ✗ Edición fallida
                              {post.editRequest.failReason ? `: ${post.editRequest.failReason}` : ""}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {showAdminLogin && (
          <div className="modal-overlay" onClick={() => setShowAdminLogin(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">🔐 Acceso Administrador</div>
              <div className="modal-subtitle">Ingresa la contraseña de administrador</div>
              <div style={{ marginBottom: 20 }}>
                <input
                  type="password"
                  className="search-input"
                  placeholder="Contraseña"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleAdminLogin()}
                  autoFocus
                />
              </div>
              {adminError && <div className="error-msg">{adminError}</div>}
              <div className="modal-actions">
                <button className="modal-btn modal-btn-secondary" onClick={() => setShowAdminLogin(false)}>
                  Cancelar
                </button>
                <button className="modal-btn modal-btn-primary" onClick={handleAdminLogin}>
                  Entrar
                </button>
              </div>
            </div>
          </div>
        )}

        {rentModalPost && (
          <div className="modal-overlay" onClick={() => setRentModalPost(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">🎫 Establecer Renta</div>
              <div className="modal-subtitle">
                Post <code style={{ color: "var(--accent)" }}>#{rentModalPost}</code> · La renta se calcula desde ahora
              </div>
              <div className="modal-row">
                <div className="modal-field">
                  <label>Días</label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={rentDays}
                    onChange={(e) => setRentDays(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="modal-field">
                  <label>Horas</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={rentHours}
                    onChange={(e) => setRentHours(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button className="modal-btn modal-btn-secondary" onClick={() => setRentModalPost(null)}>
                  Cancelar
                </button>
                <button className="modal-btn modal-btn-primary" onClick={guardarRenta}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Confirmar inicio de edición */}
        {editConfirmPost && (
          <div className="modal-overlay" onClick={() => setEditConfirmPost(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">✏️ Editar publicación</div>
              <div className="modal-subtitle">
                Vas a editar el post <code style={{ color: "var(--accent)" }}>#{editConfirmPost}</code>
              </div>

              <div style={{
                background: "rgba(59,130,246,0.08)",
                border: "1px solid rgba(59,130,246,0.25)",
                borderRadius: 14,
                padding: 18,
                marginBottom: 24,
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--gray-300)"
              }}>
                <div style={{ fontWeight: 700, color: "var(--info)", marginBottom: 8 }}>
                  ¿Cómo funciona?
                </div>
                <div>
                  1. El sistema generará un <strong>captcha de verificación</strong> en su próximo turno (1-15 min).<br/>
                  2. Te avisaremos aquí cuando esté listo, y verás un botón <strong>"Editar ahora"</strong>.<br/>
                  3. Al abrir, podrás resolver el captcha y editar todos los campos (menos teléfono).<br/>
                  4. Tendrás <strong>15 minutos</strong> para enviar antes de que caduque.
                </div>
              </div>

              <div className="modal-actions">
                <button className="modal-btn modal-btn-secondary" onClick={() => setEditConfirmPost(null)}>
                  Cancelar
                </button>
                <button className="modal-btn modal-btn-primary" onClick={confirmarEdicion}>
                  Iniciar edición
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Formulario de edición estilo MegaPersonals 1:1 */}
        {editFormPost && clientData && clientData.posts[editFormPost]?.editRequest && (
          <div className="mp-overlay" onClick={() => !editSubmitting && setEditFormPost(null)}>
            <div className="mp-modal" onClick={(e) => e.stopPropagation()}>
              {(() => {
                const er = clientData.posts[editFormPost].editRequest as EditRequest;
                const minRest = er.expiresAt
                  ? Math.max(0, Math.ceil((er.expiresAt - now) / 60000))
                  : 0;
                const secRest = er.expiresAt
                  ? Math.max(0, Math.floor((er.expiresAt - now) / 1000) % 60)
                  : 0;

                return (
                  <>
                    {/* Botón X cerrar (esquina superior derecha) */}
                    <button
                      className="mp-close-x"
                      onClick={() => !editSubmitting && setEditFormPost(null)}
                      title="Cerrar"
                    >
                      <img src="/megapersonals-img/close_bump_to_top_modal.png" alt="Cerrar" />
                    </button>

                    {/* Timer flotante */}
                    <div className="mp-timer">⏱ {minRest}:{secRest.toString().padStart(2, "0")}</div>

                    {/* Bordes decorativos rosa */}
                    <div className="mp-topborder"></div>
                    <div className="mp-leftborder"></div>
                    <div className="mp-rightborder"></div>
                    <div className="mp-bottomborder"></div>

                    {/* Logo de header */}
                    <div className="mp-header-logo">
                      <img src="/megapersonals-img/megapersonalsPageHeader2.png" alt="MegaPersonals" />
                    </div>

                    {/* ============ PESTAÑA 1: DATOS ============ */}
                    {editStep === "fields" && (
                      <div className="mp-stage">
                        <div className="mp-banner">
                          <img src="/megapersonals-img/writepost1_devilgirl.png" alt="Create Post" />
                        </div>

                        <form className="mp-form" onSubmit={(e) => e.preventDefault()}>
                          {/* I AM / I SEE */}
                          <div className="mp-row mp-row-2">
                            <div className="mp-field">
                              <label className="mp-label">I AM:</label>
                              <select className="mp-input mp-disabled" disabled value="1">
                                <option value="1">A woman</option>
                              </select>
                            </div>
                            <div className="mp-field">
                              <label className="mp-label">I SEE:</label>
                              <input
                                className="mp-input mp-disabled"
                                type="text"
                                disabled
                                value="Men"
                                readOnly
                              />
                            </div>
                          </div>

                          {/* Name / Age */}
                          <div className="mp-row mp-row-2">
                            <div className="mp-field">
                              <label className="mp-label">Name/Alias:</label>
                              <input
                                className="mp-input"
                                type="text"
                                value={editFields.name || ""}
                                onChange={(e) => setEditFields({ ...editFields, name: e.target.value })}
                              />
                            </div>
                            <div className="mp-field">
                              <label className="mp-label">Age:</label>
                              <select
                                className="mp-input"
                                value={editFields.age || "25"}
                                onChange={(e) => setEditFields({ ...editFields, age: e.target.value })}
                              >
                                {Array.from({ length: 82 }, (_, i) => i + 18).map((a) => (
                                  <option key={a} value={a}>{a}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Headline */}
                          <div className="mp-row">
                            <div className="mp-field mp-field-full">
                              <label className="mp-label">Headline: *</label>
                              <input
                                className="mp-input"
                                type="text"
                                value={editFields.title || ""}
                                onChange={(e) => setEditFields({ ...editFields, title: e.target.value })}
                              />
                            </div>
                          </div>

                          {/* Body */}
                          <div className="mp-row">
                            <div className="mp-field mp-field-full">
                              <label className="mp-label">Body: *</label>
                              <textarea
                                className="mp-input mp-textarea"
                                value={editFields.body || ""}
                                onChange={(e) => setEditFields({ ...editFields, body: e.target.value })}
                              />
                            </div>
                          </div>

                          {/* City / Phone */}
                          <div className="mp-row mp-row-2">
                            <div className="mp-field">
                              <label className="mp-label">City:</label>
                              <button
                                type="button"
                                className="mp-input mp-city-btn"
                                onClick={abrirSelectorUbicacion}
                              >
                                {editFields.cityName || "Click to select"}
                              </button>
                            </div>
                            <div className="mp-field">
                              <label className="mp-label">Phone:</label>
                              <div className="mp-phone-wrapper">
                                <input
                                  className="mp-input mp-disabled mp-phone-code"
                                  type="text"
                                  disabled
                                  value="+1"
                                  readOnly
                                />
                                <input
                                  className="mp-input mp-disabled mp-phone-number"
                                  type="text"
                                  disabled
                                  value={er.currentValues?.name ? "(no editable)" : ""}
                                  readOnly
                                />
                              </div>
                            </div>
                          </div>

                          {/* Location/Area */}
                          <div className="mp-row">
                            <div className="mp-field mp-field-full">
                              <label className="mp-label">Location/Area:</label>
                              <input
                                className="mp-input"
                                type="text"
                                value={editFields.location || ""}
                                onChange={(e) => setEditFields({ ...editFields, location: e.target.value })}
                              />
                            </div>
                          </div>

                          {/* Botón Next */}
                          <div className="mp-button-row">
                            <button
                              type="button"
                              className="mp-btn-next"
                              onClick={irAlCaptcha}
                              aria-label="Next"
                            >
                              <span style={{ visibility: "hidden" }}>Next</span>
                            </button>
                          </div>

                          {/* Cancelar */}
                          <div className="mp-cancel-row">
                            <button
                              type="button"
                              className="mp-cancel"
                              onClick={() => cancelarEdicion(editFormPost)}
                              disabled={editSubmitting}
                            >
                              Cancelar edición
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* ============ PESTAÑA 2: CAPTCHA + FOTOS ============ */}
                    {editStep === "captcha" && (
                      <div className="mp-stage">
                        <div className="mp-banner">
                          <img src="/megapersonals-img/writepost2_devilgirl.png" alt="Add Pics & Video" />
                        </div>

                        {/* Photos in this Ad (deshabilitado) */}
                        <div className="mp-section-locked">
                          <div className="mp-section-title">
                            <span className="mp-letter">A</span> Photos in this Ad:
                          </div>
                          <div className="mp-locked-content">
                            <div className="mp-locked-msg">
                              🔒 Prohibido temporalmente
                              <div className="mp-locked-sub">El cambio de fotos solo lo puede hacer Angel directamente</div>
                            </div>
                            <div className="mp-photos-grid">
                              {Array.from({ length: 12 }, (_, i) => (
                                <div key={i} className="mp-photo-cell">
                                  <img src="/megapersonals-img/pic_placeholder.png" alt={`${i+1}`} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Videos (deshabilitado) */}
                        <div className="mp-section-locked">
                          <div className="mp-section-title">
                            <span className="mp-letter mp-letter-c">C</span> Videos: <span style={{ fontWeight: 400, fontSize: 14, color: "#666" }}>(optional)</span>
                          </div>
                          <div className="mp-locked-content">
                            <div className="mp-locked-msg">
                              🔒 Prohibido temporalmente
                            </div>
                            <div className="mp-videos-grid">
                              {Array.from({ length: 4 }, (_, i) => (
                                <div key={i} className="mp-photo-cell">
                                  <img src="/megapersonals-img/pic_placeholder.png" alt={`${i+1}`} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Captcha */}
                        <div className="mp-captcha-section">
                          {er.captchaUrl && (
                            <div className="mp-captcha-image-wrapper">
                              <img className="mp-captcha-image" src={er.captchaUrl} alt="Captcha" />
                              <div className="mp-captcha-reload" title="No se puede recargar">
                                <img src="/megapersonals-img/reloadButton.png" alt="reload" />
                              </div>
                            </div>
                          )}
                          <input
                            type="text"
                            className="mp-input mp-captcha-input"
                            placeholder="Enter code from the picture"
                            value={editCaptchaCode}
                            onChange={(e) => setEditCaptchaCode(e.target.value)}
                            autoFocus
                          />
                        </div>

                        {/* Botones Back y Publish */}
                        <div className="mp-buttons-final">
                          <button
                            type="button"
                            className="mp-btn-back"
                            onClick={volverAFields}
                            disabled={editSubmitting}
                            aria-label="Back"
                          >
                            <span style={{ visibility: "hidden" }}>Back</span>
                          </button>
                          <button
                            type="button"
                            className="mp-btn-publish"
                            onClick={enviarEdicion}
                            disabled={editSubmitting}
                            aria-label="Publish"
                          >
                            <span style={{ visibility: "hidden" }}>{editSubmitting ? "..." : "Publish"}</span>
                          </button>
                        </div>

                        {/* Cancelar */}
                        <div className="mp-cancel-row">
                          <button
                            type="button"
                            className="mp-cancel"
                            onClick={() => cancelarEdicion(editFormPost)}
                            disabled={editSubmitting}
                          >
                            Cancelar edición
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}


        {/* MODAL: Selector de ubicación (estilo MegaPersonals) */}
        {showLocationPicker && (
          <div className="modal-overlay" onClick={() => { setShowLocationPicker(false); setExpandedState(null); }}>
            <div className="location-modal" onClick={(e) => e.stopPropagation()}>
              <button
                className="location-close-btn"
                onClick={() => { setShowLocationPicker(false); setExpandedState(null); }}
                aria-label="Cerrar"
              >
                ✕
              </button>
              <div className="location-title">Choose a Location</div>

              {/* United States es el ÚNICO continente disponible */}
              <button className="location-region-btn">
                United States
              </button>

              <div className="location-states-list">
                {Object.entries(US_LOCATIONS).map(([estado, info]) => {
                  const expanded = expandedState === estado;
                  return (
                    <div key={estado} className="location-state-group">
                      <button
                        className={`location-state-btn ${expanded ? "expanded" : ""}`}
                        onClick={() => setExpandedState(expanded ? null : estado)}
                      >
                        <span>{estado}</span>
                        <span className="location-state-icon">{expanded ? "−" : "+"}</span>
                      </button>
                      {expanded && (
                        <div className="location-cities-list">
                          {info.ciudades.map((ciudad) => (
                            <button
                              key={ciudad}
                              className="location-city-btn"
                              onClick={() => seleccionarCiudad(ciudad, info.abrev)}
                            >
                              {ciudad}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
