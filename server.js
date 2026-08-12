const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");
app.use(cors());
app.use(express.json());

// URL correcta de la API de Uquía
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
PRUEBA DE CONEXIÓN CON UQUÍA
====================================================

Esta ruta sirve para comprobar si Render puede
conectarse con la API de Uquía.

Después del deploy podés abrir:

https://TU-SERVIDOR.onrender.com/test-dni
*/

app.get("/test-dni", async (req, res) => {
  try {
    const dni = "4272880";

    console.log("=================================");
    console.log("TEST CONEXIÓN UQUIA");
    console.log("DNI:", dni);
    console.log("URL:", `${UQUIA_API_BASE}/clientes/get-by-dni`);
    console.log("=================================");

    const response = await axios.get(
      `${UQUIA_API_BASE}/clientes/get-by-dni`,
      {
        params: {
          dni: dni
        },

        headers: {
          Authorization: `Bearer ${process.env.UQUIA_API_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        },

        // Esperamos máximo 15 segundos
        timeout: 15000
      }
    );

    console.log("Respuesta UQUIA:");
    console.log("Status:", response.status);
    console.log(JSON.stringify(response.data, null, 2));

    return res.status(200).json({
      ok: true,
      status: response.status,
      data: response.data
    });

  } catch (error) {

    console.error("=================================");
    console.error("ERROR TEST UQUIA");
    console.error("=================================");

    console.error("Mensaje:", error.message);
    console.error("Código:", error.code);
    console.error("Status:", error.response?.status);
    console.error("Respuesta:", error.response?.data);

    return res.status(500).json({
      ok: false,
      message: error.message,
      code: error.code || null,
      status: error.response?.status || null,
      data: error.response?.data || null
    });
  }
});


/*
====================================================
FULFILLMENT DE CLIENGO
====================================================
*/

app.post("/fulfillment", async (req, res) => {

  try {

    console.log("=================================");
    console.log("FULFILLMENT REQUEST");
    console.log("=================================");

    console.log(JSON.stringify(req.body, null, 2));

    const body = req.body || {};

    /*
    -----------------------------------------------
    OBTENER DATOS DEL MENSAJE
    -----------------------------------------------
    */

    const currentAnswer = body.currentAnswer || "";

    const textMsg =
      body.text ||
      body.message ||
      "";

    const collected =
      body.collected_data || {};

    /*
    -----------------------------------------------
    CUSTOM DATA
    -----------------------------------------------
    */

    const customValues =
      typeof collected.custom === "object"
        ? Object.values(collected.custom || {}).join(" ")
        : "";

    /*
    -----------------------------------------------
    DNI
    -----------------------------------------------
    */

    const idNumberVal =
      collected.idNumber?.value || "";

    const dniVal =
      collected.dni?.value || "";

    /*
    -----------------------------------------------
    CHAT LOG
    -----------------------------------------------
    */

    const chatLog =
      Array.isArray(body.chat_log)
        ? body.chat_log
        : [];

    const ultimoMensaje =
      chatLog.length > 0
        ? (
            chatLog[chatLog.length - 1]?.message ||
            chatLog[chatLog.length - 1]?.text ||
            ""
          )
        : "";

    /*
    -----------------------------------------------
    ARMAMOS TODO EL TEXTO
    -----------------------------------------------
    */

    const textoTotal = `
      ${currentAnswer}
      ${textMsg}
      ${customValues}
      ${idNumberVal}
      ${dniVal}
      ${ultimoMensaje}
    `;

    console.log("Texto analizado:");
    console.log(textoTotal);

    /*
    -----------------------------------------------
    BUSCAR DNI
    -----------------------------------------------

    Aceptamos DNI de 7 u 8 dígitos.
    */

    const dniMatch =
      textoTotal.match(/\b\d{7,8}\b/);

    const dni =
      dniMatch
        ? dniMatch[0]
        : null;

    console.log("DNI detectado:", dni);

    /*
    -----------------------------------------------
    SI NO HAY DNI
    -----------------------------------------------
    */

    if (!dni) {

      return res.status(200).json({

        response: {

          text: [
            "👋 Por favor, ingresá tu número de DNI (7 u 8 dígitos) para consultar tu estado."
          ],

          response_type: "TEXT",

          stopChat: false
        }

      });

    }


    /*
    -----------------------------------------------
    CONSULTAR API UQUIA
    -----------------------------------------------
    */

    console.log("Consultando Uquía...");
    console.log(
      `${UQUIA_API_BASE}/clientes/get-by-dni`
    );

    const apiResponse = await axios.get(
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

        timeout: 15000
      }
    );


    /*
    -----------------------------------------------
    RESPUESTA UQUIA
    -----------------------------------------------
    */

    console.log("Respuesta API Uquía:");
    console.log(
      JSON.stringify(
        apiResponse.data,
        null,
        2
      )
    );


    const cliente =
      apiResponse.data?.data ||
      apiResponse.data;


    let textoRespuesta = "";


    /*
    -----------------------------------------------
    CLIENTE NO ENCONTRADO
    -----------------------------------------------
    */

    if (!cliente) {

      textoRespuesta =
        `❌ No encontramos ningún socio registrado con el DNI ${dni}.`;

    }


    /*
    -----------------------------------------------
    CLIENTE ENCONTRADO
    -----------------------------------------------
    */

    else {

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


    /*
    -----------------------------------------------
    RESPUESTA A CLIENGO
    -----------------------------------------------
    */

    return res.status(200).json({

      response: {

        text: [
          textoRespuesta
        ],

        response_type: "TEXT",

        stopChat: false
      },

      custom: {

        dni_consultado: dni

      }

    });


  } catch (error) {

    /*
    -----------------------------------------------
    ERROR
    -----------------------------------------------
    */

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


    /*
    -----------------------------------------------
    ERROR 404
    -----------------------------------------------
    */

    if (
      error.response?.status === 404
    ) {

      mensajeError =
        "❌ No se encontró ningún registro para el DNI ingresado.";

    }


    /*
    -----------------------------------------------
    ERROR 401
    -----------------------------------------------
    */

    if (
      error.response?.status === 401
    ) {

      mensajeError =
        "⚠️ Error de autenticación con el sistema oficial.";

    }


    /*
    -----------------------------------------------
    ERROR 403
    -----------------------------------------------
    */

    if (
      error.response?.status === 403
    ) {

      mensajeError =
        "⚠️ El sistema oficial rechazó el acceso.";

    }


    /*
    -----------------------------------------------
    TIMEOUT / RED
    -----------------------------------------------
    */

    if (
      error.code === "ETIMEDOUT" ||
      error.code === "ECONNABORTED" ||
      error.code === "ENETUNREACH" ||
      error.code === "ECONNREFUSED"
    ) {

      mensajeError =
        "⚠️ No se pudo establecer conexión con el sistema oficial de Uquía.";

    }


    /*
    -----------------------------------------------
    RESPUESTA A CLIENGO
    -----------------------------------------------
    */

    return res.status(200).json({

      response: {

        text: [
          mensajeError
        ],

        response_type: "TEXT",

        stopChat: false
      }

    });

  }

});


/*
====================================================
PUERTO
====================================================
*/

const PORT =
  process.env.PORT || 10000;


app.listen(
  PORT,
  () => {

    console.log(
      `🚀 Servidor intermediario iniciado en puerto ${PORT}`
    );

    console.log(
      `🌐 API Uquía: ${UQUIA_API_BASE}`
    );

    console.log(
      `🔑 Token configurado: ${
        process.env.UQUIA_API_TOKEN
          ? "SÍ"
          : "NO"
      }`
    );

  }
);