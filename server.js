const express = require("express");
const cors = require("cors");
const axios = require("axios");
const https = require("https");
const dns = require("dns");

// Preferir IPv4 sobre IPv6 a nivel de resolución DNS (Node 17+)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const app = express();
app.use(cors());
app.use(express.json());

// Agente HTTPS forzado a IPv4, para evitar los intentos fallidos por IPv6
const ipv4Agent = new https.Agent({ family: 4 });

// ===== Configuración =====
const UQUIA_API_BASE = 'https://api.uquia.com.ar/api/external';
const UQUIA_LOGIN_URL = 'https://api.uquia.com.ar/api/login';
const UQUIA_INTEGRATIONS_URL = 'https://api.uquia.com.ar/api/integrations';
const INTEGRATION_ID = 1; // ID de la integración "ClienGo"
const INTEGRATION_NAME = "ClienGo";

// Credenciales de admin: SIEMPRE por variable de entorno, nunca hardcodeadas
const ADMIN_EMAIL = process.env.UQUIA_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.UQUIA_ADMIN_PASSWORD;

// Token de integración de ClienGo, en memoria (se renueva solo)
let cliengoToken = null;
let tokenExpiresAt = null; // timestamp en ms

// Helper para esperar entre reintentos
const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ===== Rotación de token de integración, con reintentos =====
async function rotarTokenCliengo(intento = 1) {
  const MAX_INTENTOS = 3;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("⚠️ Faltan UQUIA_ADMIN_EMAIL / UQUIA_ADMIN_PASSWORD en el entorno. No se puede rotar el token.");
    return;
  }

  try {
    // 1. Login de admin (solo para poder rotar, no para consultar clientes)
    const loginRes = await axios.post(UQUIA_LOGIN_URL, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    }, {
      httpsAgent: ipv4Agent,
      timeout: 15000
    });
    const adminToken = loginRes.data.access_token;

    // 2. Rotar el token de integración de ClienGo
    const rotateRes = await axios.post(
      `${UQUIA_INTEGRATIONS_URL}/${INTEGRATION_ID}/rotate`,
      { nombre: INTEGRATION_NAME },
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        httpsAgent: ipv4Agent,
        timeout: 15000
      }
    );

    cliengoToken = rotateRes.data?.data?.api_key;

    // El token de integración vence a las 10hs. Renovamos con 1h de margen.
    tokenExpiresAt = Date.now() + (9 * 60 * 60 * 1000);

    console.log("✅ Token de integración ClienGo rotado correctamente.");
  } catch (error) {
    console.error(`❌ Error rotando token de ClienGo (intento ${intento}/${MAX_INTENTOS}):`, error.code || error.response?.status, error.response?.data || error.message);

    if (intento < MAX_INTENTOS) {
      const esperaMs = intento * 2000; // 2s, 4s, 6s...
      console.log(`⏳ Reintentando rotación en ${esperaMs / 1000}s...`);
      await esperar(esperaMs);
      return rotarTokenCliengo(intento + 1);
    } else {
      console.error("❌ Se agotaron los reintentos de rotación de token.");
    }
  }
}

// Devuelve un token de integración válido, rotando si hace falta
async function getTokenValido() {
  const faltaPoco = !tokenExpiresAt || Date.now() >= tokenExpiresAt;
  if (!cliengoToken || faltaPoco) {
    await rotarTokenCliengo();
  }
  return cliengoToken;
}

// Rotación proactiva cada 9 horas (por si el proceso queda corriendo sin requests)
setInterval(() => rotarTokenCliengo(), 9 * 60 * 60 * 1000);

// ===== Ruta de salud, para chequear que el server está vivo =====
app.get("/", (req, res) => {
  res.status(200).send("✅ Bot de ClienGo activo y funcionando.");
});

// ===== Ruta principal =====
app.post("/fulfillment", async (req, res) => {
  try {
    console.log("========= FULFILLMENT REQUEST =========");
    console.log(JSON.stringify(req.body, null, 2));

    const body = req.body || {};

    const currentAnswer = body.currentAnswer || "";
    const textMsg = body.text || body.message || "";
    const collected = body.collected_data || {};
    const customValues = typeof collected.custom === 'object' ? Object.values(collected.custom || {}).join(" ") : "";
    const idNumberVal = collected.idNumber?.value || "";
    const dniVal = collected.dni?.value || "";

    const chatLog = Array.isArray(body.chat_log) ? body.chat_log : [];
    const ultimoMensaje = chatLog.length > 0 ? (chatLog[chatLog.length - 1]?.message || chatLog[chatLog.length - 1]?.text || "") : "";

    const textoTotal = `${currentAnswer} ${textMsg} ${customValues} ${idNumberVal} ${dniVal} ${ultimoMensaje}`;
    const dniMatch = textoTotal.match(/\b\d{7,8}\b/);
    const dni = dniMatch ? dniMatch[0] : null;

    console.log("🔎 DNI detectado:", dni);

    if (!dni) {
      return res.status(200).json({
        response: {
          text: ["👋 Por favor, ingresá tu número de DNI (7 u 8 dígitos) para consultar tu estado."],
          response_type: "TEXT",
          stopChat: false
        }
      });
    }

    const token = await getTokenValido();
    if (!token) {
      console.error("No se pudo obtener un token válido de integración ClienGo.");
      return res.status(200).json({
        response: {
          text: ["⚠️ El sistema está temporalmente fuera de línea. Probá en unos minutos."],
          response_type: "TEXT",
          stopChat: false
        }
      });
    }

    let apiResponse;
    try {
      apiResponse = await axios.get(`${UQUIA_API_BASE}/clientes/get-by-dni`, {
        params: { dni: dni },
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        httpsAgent: ipv4Agent,
        timeout: 15000
      });
      console.log("✅ Consulta a get-by-dni OK");
    } catch (apiError) {
      console.error("❌ FALLÓ get-by-dni:", apiError.code || apiError.response?.status, apiError.response?.data || apiError.message);

      // Si da 401 pese a tener token en memoria, forzamos rotación y reintentamos una vez
      if (apiError.response?.status === 401) {
        await rotarTokenCliengo();
        if (cliengoToken) {
          try {
            apiResponse = await axios.get(`${UQUIA_API_BASE}/clientes/get-by-dni`, {
              params: { dni: dni },
              headers: {
                'Authorization': `Bearer ${cliengoToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              httpsAgent: ipv4Agent,
              timeout: 15000
            });
            console.log("✅ Reintento tras rotar token OK");
          } catch (retryError) {
            console.error("❌ Reintento tras rotar token también falló:", retryError.code || retryError.response?.status, retryError.response?.data || retryError.message);
            return res.status(200).json({
              response: {
                text: ["⚠️ El sistema está temporalmente fuera de línea. Probá más tarde."],
                response_type: "TEXT",
                stopChat: false
              }
            });
          }
        }
      } else if (apiError.response?.status === 404) {
        return res.status(200).json({
          response: {
            text: [`❌ No se encontró ningún registro para el DNI ${dni}.`],
            response_type: "TEXT",
            stopChat: false
          }
        });
      } else {
        // Timeout, ENETUNREACH, ETIMEDOUT u otro error de red
        return res.status(200).json({
          response: {
            text: ["⚠️ Ocurrió un error de conexión con el sistema oficial. Intentá de nuevo en unos instantes."],
            response_type: "TEXT",
            stopChat: false
          }
        });
      }
    }

    const cliente = apiResponse.data?.data || apiResponse.data;
    let textoRespuesta = "";

    if (!cliente) {
      textoRespuesta = `❌ No encontramos ningún socio registrado con el DNI ${dni}.`;
    } else {
      const nombreCompleto = cliente.nombre_completo || `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim() || 'Socio';
      const esActivo = cliente.activo !== undefined ? cliente.activo : (cliente.estado_cliente_id === 1);

      textoRespuesta = `👤 *${nombreCompleto}*\n\n` +
        `• *Estado:* ${esActivo ? "Activo 🟢" : "Inactivo 🔴"}`;
    }

    return res.status(200).json({
      response: {
        text: [textoRespuesta],
        response_type: "TEXT",
        stopChat: false
      },
      custom: {
        dni_consultado: dni
      }
    });

  } catch (error) {
    console.error("Error inesperado en /fulfillment:", error.response?.status, error.response?.data || error.message);

    return res.status(200).json({
      response: {
        text: ["⚠️ Ocurrió un error al consultar el sistema oficial. Intentá de nuevo."],
        response_type: "TEXT",
        stopChat: false
      }
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log(`🚀 Servidor intermediario iniciado en puerto ${PORT}`);
  await rotarTokenCliengo(); // rota un token de integración apenas arranca el server
});