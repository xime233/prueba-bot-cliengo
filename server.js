const express = require("express");
const cors = require("cors");
const axios = require("axios"); // Importamos axios para consumir la API externa

const app = express();

app.use(cors());
app.use(express.json());

// URL base de la API oficial del backend de Uquia
const UQUIA_API_BASE = 'https://api.uquia.com.ar/api/external';

// Endpoint base
app.get("/", (req, res) => {
  res.send("API Intermediaria Uquia funcionando con API Oficial");
});

// Endpoint Fulfillment Nativo de Cliengo adaptado para consumir la API del Back
app.post("/fulfillment", async (req, res) => {
  try {
    console.log("========= FULFILLMENT REQUEST =========");
    console.log(JSON.stringify(req.body, null, 2));

    const body = req.body || {};

    // Extracción ultra flexible del texto o DNI mandado por el usuario o el bot
    const currentAnswer = body.currentAnswer || "";
    const textMsg = body.text || body.message || "";
    const collected = body.collected_data || {};
    const customValues = typeof collected.custom === 'object' ? Object.values(collected.custom || {}).join(" ") : "";
    const idNumberVal = collected.idNumber?.value || "";
    const dniVal = collected.dni?.value || "";

    const chatLog = Array.isArray(body.chat_log) ? body.chat_log : [];
    const ultimoMensaje = chatLog.length > 0 ? (chatLog[chatLog.length - 1]?.message || chatLog[chatLog.length - 1]?.text || "") : "";

    // Unimos todo para buscar coincidencias de DNI en cualquier parte del payload
    const textoTotal = `${currentAnswer} ${textMsg} ${customValues} ${idNumberVal} ${dniVal} ${ultimoMensaje}`;

    // Buscar patrón de 7 u 8 dígitos correspondientes a un DNI
    const dniMatch = textoTotal.match(/\b\d{7,8}\b/);
    const dni = dniMatch ? dniMatch[0] : null;

    if (!dni) {
      return res.status(200).json({
        response: {
          text: ["👋 Por favor, ingresá tu número de DNI para consultar tu estado."],
          response_type: "TEXT",
          stopChat: false
        }
      });
    }

    // Consulta a la API OFICIAL DEL BACKEND (en vez de Neon) usando el token de Render
    const apiResponse = await axios.get(`${UQUIA_API_BASE}/clientes/get-by-dni`, {
      params: { dni: dni },
      headers: {
        'Authorization': `Bearer ${process.env.UQUIA_API_TOKEN}`
      }
    });

    const cliente = apiResponse.data;
    let textoRespuesta = "";

    if (!cliente) {
      textoRespuesta = `❌ No encontramos ningún socio registrado con el DNI ${dni}.`;
    } else {
      textoRespuesta = `👤 *${cliente.nombre || 'Socio'}*\n\n` +
        `• *Estado:* ${cliente.activo ? "Activo 🟢" : "Inactivo 🔴"}\n` +
        `• *Deuda:* ${cliente.tiene_deuda ? "Sí ⚠️" : "No"}\n` +
        `• *Préstamo vigente:* ${cliente.prestamo_vigente ? "Sí 💰" : "No"}`;
    }

    // Respuesta con el Contrato Exacto de Fulfillment Nativo
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
    console.error("Error al consultar la API oficial en /fulfillment:", error.response?.data || error.message);
    return res.status(200).json({
      response: {
        text: ["⚠️ Ocurrió un error al consultar el sistema oficial. Intentá de nuevo."],
        response_type: "TEXT",
        stopChat: false
      }
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor intermediario iniciado en puerto ${PORT}`);
});