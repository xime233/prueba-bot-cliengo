const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API Uquia funcionando");
});

app.get("/socios", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM socios"
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message
    });
  }
});

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

    res.status(500).json({
      error: error.message
    });

  }
});

app.post("/solicitudes", async (req, res) => {
  try {

    const {
      nombre,
      dni,
      telefono,
      monto
    } = req.body;

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

    res.status(500).json({
      error: error.message
    });

  }
});

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

    res.status(500).json({
      error: error.message
    });

  }
});
app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});
app.listen(3000, () => {
  console.log("Servidor iniciado en puerto 3000");
});