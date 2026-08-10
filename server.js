const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// URL base oficial provista por la documentación
const UQUIA_API_BASE = 'https://api.uquia.com.ar/api/external';

app.post("/fulfillment", async (req, res) => {
  try {
    console.log("========= FULFILLMENT REQUEST =========");
    console.log(JSON.stringify(req.body, null, 2));

    const body = req.body || {};

    // Extracción flexible del DNI desde el chat de Cliengo
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

    if (!dni) {
      return res.status(200).json({
        response: {
          text: ["👋 Por favor, ingresá tu número de DNI (7 u 8 dígitos) para consultar tu estado."],
          response_type: "TEXT",
          stopChat: false
        }
      });
    }

    // 1. Consultar cliente por DNI usando la ruta oficial: GET /api/external/clientes/get-by-dni
    const apiResponse = await axios.get(`${UQUIA_API_BASE}/clientes/get-by-dni`, {
      params: { dni: dni },
      headers: {
        'Authorization': `Bearer ${process.env.UQUIA_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    const cliente = apiResponse.data;
    let textoRespuesta = "";

    if (!cliente) {
      textoRespuesta = `❌ No encontramos ningún socio registrado con el DNI ${dni}.`;
    } else {
      // Tomamos los datos que devuelve la API oficial
      const nombreCompleto = `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim() || 'Socio';
      const esActivo = cliente.activo !== undefined ? cliente.activo : (cliente.estado_cliente_id === 1);

      textoRespuesta = `👤 *${nombreCompleto}*\n\n` +
        `• *Estado:* ${esActivo ? "Activo 🟢" : "Inactivo 🔴"}`;
    }

    // Respuesta con el contrato nativo de Cliengo
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
    console.error("Error al consultar la API de Uquia:", error.response?.status, error.response?.data || error.message);
    
    // Si la API responde 404 u otro error controlable
    let mensajeError = "⚠️ Ocurrió un error al consultar el sistema oficial. Intentá de nuevo.";
    if (error.response?.status === 404) {
      mensajeError = `❌ No se encontró ningún registro para el DNI ingresado.`;
    }

    return res.status(200).json({
      response: {
        text: [mensajeError],
        response_type: "TEXT",
        stopChat: false
      }
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor intermediario iniciado en puerto ${PORT}`);
});