const express = require("express");
const cors = require("cors");
const axios = require("axios");
const dns = require("dns");
const https = require("https");

dns.setDefaultResultOrder("ipv4first");

const app = express();

app.use(cors());
app.use(express.json());

const UQUIA_API_BASE = "https://api.uquia.com.ar/api/external";


/*
====================================================
RUTA PRINCIPAL
====================================================
*/

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Servidor intermediario Uquía funcionando"
  });
});


/*
====================================================
TEST DNS
====================================================
*/

app.get("/test-dns", async (req, res) => {
  try {
    const dnsPromises = require("dns").promises;

    const result = await dnsPromises.lookup(
      "api.uquia.com.ar",
      {
        all: true
      }
    );

    console.log("=================================");
    console.log("DNS UQUIA DESDE RENDER");
    console.log("=================================");
    console.log(result);

    return res.status(200).json({
      ok: true,
      hostname: "api.uquia.com.ar",
      addresses: result
    });

  } catch (error) {

    console.error("ERROR DNS UQUIA:", error);

    return res.status(500).json({
      ok: false,
      message: error.message,
      code: error.code || null
    });
  }
});


/*
====================================================
TEST CONEXIÓN DIRECTA A IP
====================================================

IMPORTANTE:
Esta es solamente una prueba.

Forzamos temporalmente la IP 77.37.85.203,
que desde tu computadora respondió correctamente.

El hostname HTTPS sigue siendo:
api.uquia.com.ar
====================================================
*/

app.get("/test-ip", async (req, res) => {

  try {

    console.log("=================================");
    console.log("TEST IP DIRECTA UQUIA");
    console.log("=================================");

    const response = await axios.get(
      `${UQUIA_API_BASE}/clientes/get-by-dni`,
      {
        params: {
          dni: "4272880"
        },

        headers: {
          Authorization:
            `Bearer ${process.env.UQUIA_API_TOKEN}`,

          Accept:
            "application/json",

          "Content-Type":
            "application/json"
        },

        timeout: 15000,

        httpsAgent: new https.Agent({

          lookup: (
            hostname,
            options,
            callback
          ) => {

            console.log(
              "Forzando conexión a:",
              "77.37.85.203"
            );

            callback(
              null,
              "77.37.85.203",
              4
            );
          }

        })
      }
    );


    console.log(
      "Status:",
      response.status
    );

    console.log(
      "Respuesta:",
      JSON.stringify(
        response.data,
        null,
        2
      )
    );


    return res.status(200).json({

      ok: true,

      status:
        response.status,

      data:
        response.data

    });


  } catch (error) {

    console.error("=================================");
    console.error("ERROR TEST IP UQUIA");
    console.error("=================================");

    console.error(
      "Mensaje:",
      error.message
    );

    console.error(
      "Código:",
      error.code
    );

    console.error(
      "Status:",
      error.response?.status
    );

    console.error(
      "Respuesta:",
      error.response?.data
    );


    return res.status(500).json({

      ok: false,

      message:
        error.message,

      code:
        error.code || null,

      status:
        error.response?.status || null,

      data:
        error.response?.data || null

    });

  }

});


/*
====================================================
TEST DNI NORMAL
====================================================
*/

app.get("/test-dni", async (req, res) => {

  try {

    const dni = "4272880";

    console.log("=================================");
    console.log("TEST DNI UQUIA");
    console.log("=================================");

    console.log(
      "URL:",
      `${UQUIA_API_BASE}/clientes/get-by-dni`
    );

    console.log(
      "DNI:",
      dni
    );

    const response = await axios.get(
      `${UQUIA_API_BASE}/clientes/get-by-dni`,
      {

        params: {
          dni: dni
        },

        headers: {

          Authorization:
            `Bearer ${process.env.UQUIA_API_TOKEN}`,

          Accept:
            "application/json",

          "Content-Type":
            "application/json"

        },

        timeout:
          15000

      }
    );


    return res.status(200).json({

      ok: true,

      status:
        response.status,

      data:
        response.data

    });


  } catch (error) {

    console.error("=================================");
    console.error("ERROR TEST DNI");
    console.error("=================================");

    console.error(
      "Mensaje:",
      error.message
    );

    console.error(
      "Código:",
      error.code
    );

    console.error(
      "Status:",
      error.response?.status
    );

    console.error(
      "Respuesta:",
      error.response?.data
    );


    return res.status(500).json({

      ok: false,

      message:
        error.message,

      code:
        error.code || null,

      status:
        error.response?.status || null,

      data:
        error.response?.data || null

    });

  }

});


/*
====================================================
FULFILLMENT CLIENGO
====================================================
*/

app.post("/fulfillment", async (req, res) => {

  try {

    console.log("=================================");
    console.log("FULFILLMENT REQUEST");
    console.log("=================================");

    console.log(
      JSON.stringify(
        req.body,
        null,
        2
      )
    );


    const body =
      req.body || {};


    const currentAnswer =
      body.currentAnswer || "";


    const textMsg =
      body.text ||
      body.message ||
      "";


    const collected =
      body.collected_data || {};


    const customValues =
      typeof collected.custom === "object"
        ? Object.values(
            collected.custom || {}
          ).join(" ")
        : "";


    const idNumberVal =
      collected.idNumber?.value ||
      "";


    const dniVal =
      collected.dni?.value ||
      "";


    const chatLog =
      Array.isArray(body.chat_log)
        ? body.chat_log
        : [];


    const ultimoMensaje =
      chatLog.length > 0
        ? (
            chatLog[
              chatLog.length - 1
            ]?.message ||

            chatLog[
              chatLog.length - 1
            ]?.text ||

            ""
          )
        : "";


    const textoTotal = `
      ${currentAnswer}
      ${textMsg}
      ${customValues}
      ${idNumberVal}
      ${dniVal}
      ${ultimoMensaje}
    `;


    console.log(
      "Texto analizado:",
      textoTotal
    );


    /*
    -----------------------------------------------
    BUSCAR DNI
    -----------------------------------------------
    */

    const dniMatch =
      textoTotal.match(
        /\b\d{7,8}\b/
      );


    const dni =
      dniMatch
        ? dniMatch[0]
        : null;


    console.log(
      "DNI detectado:",
      dni
    );


    if (!dni) {

      return res.status(200).json({

        response: {

          text: [
            "👋 Por favor, ingresá tu número de DNI (7 u 8 dígitos) para consultar tu estado."
          ],

          response_type:
            "TEXT",

          stopChat:
            false

        }

      });

    }


    /*
    -----------------------------------------------
    CONSULTAR UQUIA
    -----------------------------------------------
    */

    console.log(
      "Consultando Uquía..."
    );


    const apiResponse =
      await axios.get(
        `${UQUIA_API_BASE}/clientes/get-by-dni`,
        {

          params: {
            dni: dni
          },

          headers: {

            Authorization:
              `Bearer ${process.env.UQUIA_API_TOKEN}`,

            "Content-Type":
              "application/json",

            Accept:
              "application/json"

          },

          timeout:
            15000

        }
      );


    console.log(
      "Respuesta API Uquía:",
      JSON.stringify(
        apiResponse.data,
        null,
        2
      )
    );


    const cliente =
      apiResponse.data?.data ||
      apiResponse.data;


    let textoRespuesta =
      "";


    if (!cliente) {

      textoRespuesta =
        `❌ No encontramos ningún socio registrado con el DNI ${dni}.`;

    } else {

      const nombreCompleto =

        cliente.nombre_completo ||

        `${cliente.nombre || ""} ${cliente.apellido || ""}`
          .trim() ||

        "Socio";


      const esActivo =

        cliente.activo !== undefined

          ? cliente.activo

          : (
              cliente.estado_cliente_id === 1
            );


      textoRespuesta =

        `👤 *${nombreCompleto}*\n\n` +

        `• *Estado:* ${
          esActivo
            ? "Activo 🟢"
            : "Inactivo 🔴"
        }`;

    }


    return res.status(200).json({

      response: {

        text: [
          textoRespuesta
        ],

        response_type:
          "TEXT",

        stopChat:
          false

      },

      custom: {

        dni_consultado:
          dni

      }

    });


  } catch (error) {

    console.error(
      "================================="
    );

    console.error(
      "ERROR AL CONSULTAR API UQUIA"
    );

    console.error(
      "================================="
    );

    console.error(
      "Mensaje:",
      error.message
    );

    console.error(
      "Código:",
      error.code
    );

    console.error(
      "Status:",
      error.response?.status
    );

    console.error(
      "Respuesta:",
      error.response?.data
    );


    let mensajeError =
      "⚠️ Ocurrió un error al consultar el sistema oficial. Intentá de nuevo.";


    if (
      error.response?.status === 404
    ) {

      mensajeError =
        "❌ No se encontró ningún registro para el DNI ingresado.";

    }


    if (
      error.response?.status === 401
    ) {

      mensajeError =
        "⚠️ Error de autenticación con el sistema oficial.";

    }


    if (
      error.response?.status === 403
    ) {

      mensajeError =
        "⚠️ El sistema oficial rechazó el acceso.";

    }


    if (
      error.code === "ETIMEDOUT" ||
      error.code === "ECONNABORTED" ||
      error.code === "ENETUNREACH" ||
      error.code === "ECONNREFUSED"
    ) {

      mensajeError =
        "⚠️ No se pudo establecer conexión con el sistema oficial de Uquía.";

    }


    return res.status(200).json({

      response: {

        text: [
          mensajeError
        ],

        response_type:
          "TEXT",

        stopChat:
          false

      }

    });

  }

});


/*
====================================================
INICIAR SERVIDOR
====================================================
*/

const PORT =
  process.env.PORT || 10000;


app.listen(
  PORT,
  () => {

    console.log(
      "================================="
    );

    console.log(
      "🚀 SERVIDOR UQUIA INICIADO"
    );

    console.log(
      "================================="
    );

    console.log(
      "Puerto:",
      PORT
    );

    console.log(
      "API:",
      UQUIA_API_BASE
    );

    console.log(
      "Token configurado:",
      process.env.UQUIA_API_TOKEN
        ? "SÍ"
        : "NO"
    );

  }
);