const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false } }
);

async function query(sql, params = []) {
  const client = await pool.connect();
  try { return await client.query(sql, params); }
  finally { client.release(); }
}

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      plate TEXT,
      created_at TEXT NOT NULL DEFAULT (NOW())
    );
    CREATE TABLE IF NOT EXISTS refuels (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      km DOUBLE PRECISION NOT NULL,
      liters DOUBLE PRECISION NOT NULL,
      price_per_liter DOUBLE PRECISION NOT NULL,
      total_cost DOUBLE PRECISION NOT NULL,
      is_full_tank INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      receipt TEXT,
      station_id TEXT,
      created_at TEXT NOT NULL DEFAULT (NOW())
    );
    CREATE TABLE IF NOT EXISTS fuel_stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT (NOW())
    );
    CREATE TABLE IF NOT EXISTS fuel_prices (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
      fuel_type TEXT NOT NULL,
      price DOUBLE PRECISION NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (NOW()),
      UNIQUE(station_id, fuel_type)
    );
  `);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function getIdFromUrl(url, prefix) {
  const u = new URL(url, 'http://localhost');
  const id = u.searchParams.get('id');
  if (id) return id;
  const match = url.match(new RegExp(`^${prefix}/([^/]+)`));
  return match ? match[1] : null;
}

module.exports = { query, initDb, cors, json, readBody, getIdFromUrl, supabase };
