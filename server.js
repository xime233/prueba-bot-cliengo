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

    // Mensaje del visitante
    const ultimoMensaje =
      req.body.chat_log?.[req.body.chat_log.length - 1]?.message || "";

    // DNI de 7 u 8 dígitos
    const dni = ultimoMensaje.match(/\b\d{7,8}\b/)?.[0];

    if (!dni) {
      return res.json({
        response: {
          text: [
            "👋 Hola. Para consultar tu estado de socio, escribime tu número de DNI."
          ],
          response_type: "TEXT"
        }
      });
    }

    const result = await pool.query(
      "SELECT * FROM socios WHERE dni = $1",
      [dni]
    );

    if (result.rows.length === 0) {
      return res.json({
        response: {
          text: [
            "❌ No encontramos un socio registrado con ese DNI."
          ],
          response_type: "TEXT"
        }
      });
    }

    const socio = result.rows[0];

    return res.json({
      response: {
        text: [
          `👤 ${socio.nombre}\n\nEstado: ${socio.socio_activo ? "Activo 🟢" : "Inactivo 🔴"}\n\nDeuda: ${socio.tiene_deuda ? "Sí ⚠️" : "No"}\n\nPréstamo vigente: ${socio.prestamo_vigente ? "Sí 💰" : "No"}`
        ],
        response_type: "TEXT"
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      response: {
        text: [
          "⚠️ Ocurrió un error al consultar el sistema."
        ],
        response_type: "TEXT"
      }
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
});