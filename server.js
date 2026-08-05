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

// Endpoint Fulfillment para Cliengo
app.post("/fulfillment", async (req, res) => {
  try {
    console.log("========= FULFILLMENT =========");
    console.log(JSON.stringify(req.body, null, 2));

    // Extraer el último texto enviado por el visitante
    const chatLog = req.body.chat_log || [];
    const ultimoMensajeObjeto = chatLog[chatLog.length - 1];
    const ultimoMensaje = ultimoMensajeObjeto?.text || "";

    // Buscar DNI (7 u 8 dígitos)
    const dniMatch = ultimoMensaje.match(/\b\d{7,8}\b/);
    const dni = dniMatch ? dniMatch[0] : null;

    if (!dni) {
      return res.status(200).json({
        responses: [
          {
            text: "👋 Hola. Para consultar tu estado de socio, por favor ingresá tu número de DNI."
          }
        ]
      });
    }

    const result = await pool.query(
      "SELECT * FROM socios WHERE dni = $1",
      [dni]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        responses: [
          {
            text: `❌ No encontramos ningún socio registrado con el DNI ${dni}.`
          }
        ]
      });
    }

    const socio = result.rows[0];

    const respuestaTexto = `👤 *${socio.nombre}*\n\n` +
      `• *Estado:* ${socio.socio_activo ? "Activo 🟢" : "Inactivo 🔴"}\n` +
      `• *Deuda:* ${socio.tiene_deuda ? "Sí ⚠️" : "No"}\n` +
      `• *Préstamo vigente:* ${socio.prestamo_vigente ? "Sí 💰" : "No"}`;

    return res.status(200).json({
      responses: [
        {
          text: respuestaTexto
        }
      ]
    });

  } catch (error) {
    console.error("Error en /fulfillment:", error);
    return res.status(200).json({
      responses: [
        {
          text: "⚠️ Ocurrió un error al consultar la base de datos. Intentá de nuevo más tarde."
        }
      ]
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
});