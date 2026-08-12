const express = require("express");
const cors = require("cors");
const axios = require("axios");
const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

const app = express();

app.use(cors());
app.use(express.json());

const UQUIA_API_BASE =
  "https://api.uquia.com.ar/api/external";


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
    console.log("DNS UQUIA");
    console.log("=================================");

    console.log(result);

    return res.status(200).json({
      ok: true,
      hostname: "api.uquia.com.ar",
      addresses: result
    });

  } catch (error) {

    console.error(
      "ERROR DNS:",
      error.message
    );

    return res.status(500).json({
      ok: false,
      message: error.message,
      code: error.code || null
    });

  }

});


/*
====================================================
TEST NORMAL UQUIA
====================================================
*/

app.get("/test-dni", async (req, res) => {

  const dni = "4272880";

  try {

    console.log("=================================");
    console.log("TEST DNI UQUIA");
    console.log("=================================");

    console.log("DNI:", dni);

    console.log(
      "URL:",
      `${UQUIA_API_BASE}/clientes/get-by-dni`
    );

    console.log(
      "TOKEN:",
      process.env.UQUIA_API_TOKEN
        ? "CONFIGURADO"
        : "NO CONFIGURADO"
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

        timeout: 15000

      }
    );


    console.log(
      "STATUS:",
      response.status
    );

    console.log(
      "DATA:",
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


    /*
    -----------------------------------------------
    DATOS RECIBIDOS
    -----------------------------------------------
    */

    const currentAnswer =
      body.currentAnswer || "";


    const textMsg =
      body.text ||
      body.message ||
      "";


    const collected =
      body.collected_data || {};


    /*
    -----------------------------------------------
    CUSTOM
    -----------------------------------------------
    */

    const customValues =
      typeof collected.custom === "object"
        ? Object.values(
            collected.custom || {}
          ).join(" ")
        : "";


    /*
    -----------------------------------------------
    DNI
    -----------------------------------------------
    */

    const idNumberVal =
      collected.idNumber?.value ||
      "";


    const dniVal =
      collected.dni?.value ||
      "";


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
            chatLog[
              chatLog.length - 1
            ]?.message ||

            chatLog[
              chatLog.length - 1
            ]?.text ||

            ""
          )
        : "";


    /*
    -----------------------------------------------
    TEXTO COMPLETO
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


    console.log(
      "Texto analizado:"
    );

    console.log(
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


    /*
    -----------------------------------------------
    NO HAY DNI
    -----------------------------------------------
    */

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
      "================================="
    );

    console.log(
      "CONSULTANDO UQUIA"
    );

    console.log(
      "DNI:",
      dni
    );

    console.log(
      "================================="
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

            Accept:
              "application/json",

            "Content-Type":
              "application/json"

          },

          timeout:
            15000

        }
      );


    /*
    -----------------------------------------------
    RESPUESTA UQUIA
    -----------------------------------------------
    */

    console.log(
      "Respuesta UQUIA:"
    );

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


    let textoRespuesta =
      "";


    /*
    -----------------------------------------------
    NO ENCONTRADO
    -----------------------------------------------
    */

    if (!cliente) {

      textoRespuesta =
        `❌ No encontramos ningún socio registrado con el DNI ${dni}.`;

    }


    /*
    -----------------------------------------------
    ENCONTRADO
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
    RESPUESTA CLIENGO
    -----------------------------------------------
    */

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

    console.error("=================================");
    console.error("ERROR AL CONSULTAR API UQUIA");
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


    let mensajeError =
      "⚠️ Ocurrió un error al consultar el sistema oficial. Intentá de nuevo.";


    /*
    -----------------------------------------------
    401
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
    403
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
    404
    -----------------------------------------------
    */

    if (
      error.response?.status === 404
    ) {

      mensajeError =
        `❌ No se encontró ningún registro para el DNI ingresado.`;

    }


    /*
    -----------------------------------------------
    ERRORES DE CONEXIÓN
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
    RESPUESTA CLIENGO
    -----------------------------------------------
    */

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
      "Token:",
      process.env.UQUIA_API_TOKEN
        ? "CONFIGURADO"
        : "NO CONFIGURADO"
    );

  }
);