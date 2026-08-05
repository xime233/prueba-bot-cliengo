const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

// Endpoint base
app.get("/", (req, res) => {
  res.send("API Uquia funcionando");
});

// Obtener todos los socios
app.get("/socios", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM socios");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Verificar estado de socio por DNI
app.post("/verificar-socio", async (req, res) => {
  try {
    const { dni } = req.body;

    const result = await pool.query(
      "SELECT * FROM socios WHERE dni = $1",
      [dni]
    );

    if (result.rows.length === 0) {
      return res.json({
        socio: false,
        mensaje: "No encontrado"
      });
    }

    const socio = result.rows[0];

    res.json({
      socio: socio.socio_activo,
      deuda: socio.tiene_deuda,
      prestamoVigente: socio.prestamo_vigente,
      nombre: socio.nombre
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Registrar nueva solicitud de préstamo
app.post("/solicitudes", async (req, res) => {
  try {
    const { nombre, dni, telefono, monto } = req.body;

    const socioResult = await pool.query(
      "SELECT * FROM socios WHERE dni = $1",
      [dni]
    );

    if (socioResult.rows.length === 0) {
      return res.status(400).json({
        mensaje: "El DNI no pertenece a un socio"
      });
    }

    const socio = socioResult.rows[0];

    if (socio.tiene_deuda) {
      return res.status(400).json({
        mensaje: "El socio posee deuda pendiente"
      });
    }

    if (socio.prestamo_vigente) {
      return res.status(400).json({
        mensaje: "El socio ya posee un préstamo vigente"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO solicitudes_prestamo
      (nombre, dni, telefono, monto)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [nombre, dni, telefono, monto]
    );

    res.status(201).json({
      mensaje: "Solicitud registrada",
      solicitud: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener todas las solicitudes
app.get("/solicitudes", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM solicitudes_prestamo
      ORDER BY created_at DESC
      `
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Test de base de datos
app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint Fulfillment Nativo de Cliengo
app.post("/fulfillment", async (req, res) => {
  try {
    console.log("========= FULFILLMENT REQUEST =========");
    console.log(JSON.stringify(req.body, null, 2));

    const body = req.body || {};
    const collected = body.collected_data || {};

    // 1. Extraer el DNI desde collected_data o chat_log
    const customValues = Object.values(collected.custom || {}).join(" ");
    const idNumberVal = collected.idNumber?.value || "";
    const dniVal = collected.dni?.value || "";

    const chatLog = body.chat_log || [];
    const ultimoMensaje = chatLog[chatLog.length - 1]?.message || chatLog[chatLog.length - 1]?.text || "";

    const textoTotal = `${customValues} ${idNumberVal} ${dniVal} ${ultimoMensaje}`;

    // Buscar patrón de 7 u 8 dígitos
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

    // 2. Consulta a PostgreSQL
    const result = await pool.query(
      "SELECT * FROM socios WHERE dni = $1",
      [dni]
    );

    let textoRespuesta = "";

    if (result.rows.length === 0) {
      textoRespuesta = `❌ No encontramos ningún socio registrado con el DNI ${dni}.`;
    } else {
      const socio = result.rows[0];
      textoRespuesta = `👤 *${socio.nombre}*\n\n` +
        `• *Estado:* ${socio.socio_activo ? "Activo 🟢" : "Inactivo 🔴"}\n` +
        `• *Deuda:* ${socio.tiene_deuda ? "Sí ⚠️" : "No"}\n` +
        `• *Préstamo vigente:* ${socio.prestamo_vigente ? "Sí 💰" : "No"}`;
    }

    // 3. Respuesta con el Contrato Exacto de Fulfillment Nativo
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
    console.error("Error en /fulfillment:", error);
    const msjError = "⚠️ Ocurrió un error al consultar la base de datos. Intentá de nuevo.";
    return res.status(200).json({
      response: {
        text: [msjError],
        response_type: "TEXT",
        stopChat: false
      }
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
});