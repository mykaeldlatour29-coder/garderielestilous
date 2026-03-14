// Base de données persistante via GitHub API
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const DB_FILE = 'data/db.json';

const DEFAULTS = {
  enfants: [], parents: [], factures: [],
  evenements: [], chats: {}, absences: [],
  photos: [], messagesEnvoyes: [], presences: {},
  config: { mdp: 'garderie123' }
};

let memCache = null;
let memCacheSha = null;

async function fetchDB() {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    const fs = require('fs');
    try { if (fs.existsSync('/tmp/db.json')) return JSON.parse(fs.readFileSync('/tmp/db.json','utf8')); } catch(e) {}
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${DB_FILE}`, {
      headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (res.status === 404) return JSON.parse(JSON.stringify(DEFAULTS));
    const json = await res.json();
    memCacheSha = json.sha;
    const db = JSON.parse(Buffer.from(json.content, 'base64').toString('utf8'));
    memCache = db;
    return db;
  } catch(e) { return memCache || JSON.parse(JSON.stringify(DEFAULTS)); }
}

async function saveDB(db) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    const fs = require('fs');
    fs.writeFileSync('/tmp/db.json', JSON.stringify(db));
    return;
  }
  try {
    const content = Buffer.from(JSON.stringify(db, null, 2)).toString('base64');
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${DB_FILE}`, {
      method: 'PUT',
      headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'DB update', content, ...(memCacheSha ? { sha: memCacheSha } : {}) })
    });
    const json = await res.json();
    if (json.content?.sha) memCacheSha = json.content.sha;
    memCache = db;
  } catch(e) { console.error('saveDB error:', e.message); }
}

function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2,5); }

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const params = event.queryStringParameters || {};
  const { action, col } = params;

  try {
    const db = await fetchDB();

    if (event.httpMethod === 'GET' && action === 'getAll') {
      const data = db[col] || [];
      return { statusCode: 200, headers, body: JSON.stringify(Array.isArray(data) ? data : Object.values(data)) };
    }
    if (event.httpMethod === 'GET' && action === 'getDoc') {
      const doc = Array.isArray(db[col]) ? (db[col]||[]).find(x=>String(x.id)===String(params.id)) : (db[col]?.[params.id]||null);
      return { statusCode: 200, headers, body: JSON.stringify(doc) };
    }
    if (event.httpMethod === 'POST' && action === 'add') {
      const body = JSON.parse(event.body||'{}');
      body.id = generateId();
      if (!Array.isArray(db[col])) db[col] = [];
      db[col].push(body);
      await saveDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ id: body.id }) };
    }
    if (event.httpMethod === 'PUT' && action === 'set') {
      const body = JSON.parse(event.body||'{}');
      body.id = params.id;
      if (!Array.isArray(db[col])) db[col] = [];
      const idx = db[col].findIndex(x=>String(x.id)===String(params.id));
      if (idx>=0) db[col][idx]=body; else db[col].push(body);
      await saveDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
    if (event.httpMethod === 'PUT' && action === 'update') {
      const body = JSON.parse(event.body||'{}');
      if (!Array.isArray(db[col])) db[col] = [];
      const idx = db[col].findIndex(x=>String(x.id)===String(params.id));
      if (idx>=0) db[col][idx] = { ...db[col][idx], ...body };
      await saveDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
    if (event.httpMethod === 'DELETE' && action === 'delete') {
      if (Array.isArray(db[col])) db[col] = db[col].filter(x=>String(x.id)!==String(params.id));
      await saveDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
    if (event.httpMethod === 'GET' && action === 'getPresences') {
      return { statusCode: 200, headers, body: JSON.stringify(db.presences?.[params.date]||{}) };
    }
    if (event.httpMethod === 'PUT' && action === 'setPresences') {
      if (!db.presences) db.presences = {};
      db.presences[params.date] = JSON.parse(event.body||'{}');
      await saveDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
    if (event.httpMethod === 'GET' && action === 'getChat') {
      return { statusCode: 200, headers, body: JSON.stringify(db.chats?.[params.parentId]||{ parentId: params.parentId, messages: [] }) };
    }
    if (event.httpMethod === 'PUT' && action === 'setChat') {
      if (!db.chats) db.chats = {};
      db.chats[params.parentId] = JSON.parse(event.body||'{}');
      await saveDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Action inconnue: ' + action }) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
