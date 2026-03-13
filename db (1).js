const fs = require('fs');
const path = require('path');

// Base de données JSON stockée dans /tmp (persistée entre appels sur Netlify)
const DB_PATH = '/tmp/tilous-db.json';

// Données par défaut
const DEFAULTS = {
  enfants: [
    { id:'enf1', prenom:'Léa',   nom:'Bouchard', ddn:'2023-04-12', groupe:'Petits (18 mois-3 ans)', allergie:'',              code:'LEA-4829', photo:'', parents:[] },
    { id:'enf2', prenom:'Théo',  nom:'Martin',   ddn:'2022-11-03', groupe:'Moyens (3-4 ans)',        allergie:'',              code:'THE-7712', photo:'', parents:[] },
    { id:'enf3', prenom:'Emma',  nom:'Roy',       ddn:'2024-01-20', groupe:'Bébés (0-18 mois)',      allergie:'Lait de vache', code:'EMM-3341', photo:'', parents:[] },
    { id:'enf4', prenom:'Noah',  nom:'Gagnon',    ddn:'2021-08-15', groupe:'Grands (4-5 ans)',       allergie:'',              code:'NOA-9205', photo:'', parents:[] },
    { id:'enf5', prenom:'Lucas', nom:'Leblanc',   ddn:'2023-02-28', groupe:'Petits (18 mois-3 ans)', allergie:'Arachides',     code:'LUC-6614', photo:'', parents:[] },
  ],
  parents: [],
  factures: [
    { id:'fac1', enfantId:'enf1', famille:'Bouchard', enfant:'Léa Bouchard',   desc:'Garde mars 2026', montant:380, echeance:'2026-03-31', statut:'attente', note:'' },
    { id:'fac2', enfantId:'enf2', famille:'Martin',   enfant:'Théo Martin',   desc:'Garde mars 2026', montant:380, echeance:'2026-03-31', statut:'payee',   note:'' },
    { id:'fac3', enfantId:'enf3', famille:'Roy',      enfant:'Emma Roy',      desc:'Garde mars 2026', montant:380, echeance:'2026-03-31', statut:'payee',   note:'' },
    { id:'fac4', enfantId:'enf4', famille:'Gagnon',   enfant:'Noah Gagnon',   desc:'Garde mars 2026', montant:380, echeance:'2026-03-31', statut:'attente', note:'' },
    { id:'fac5', enfantId:'enf5', famille:'Leblanc',  enfant:'Lucas Leblanc', desc:'Garde mars 2026', montant:380, echeance:'2026-03-31', statut:'retard',  note:'2e rappel' },
  ],
  evenements: [
    { id:'ev1', date:'2026-03-14', heure:'09:30', titre:'Sortie au parc',      cat:'sortie',   note:'Apporter bottes',   visible:'oui' },
    { id:'ev2', date:'2026-03-20', heure:'17:30', titre:'Réunion parents',     cat:'reunion',  note:'Salle commune',     visible:'oui' },
    { id:'ev3', date:'2026-03-25', heure:'00:00', titre:'Congé vendredi saint',cat:'conge',    note:'Garderie fermée',   visible:'oui' },
  ],
  chats: {},
  absences: [],
  photos: [],
  messagesEnvoyes: [
    { id:'msg1', dest:'Tous les parents', sujet:'Bienvenue sur Les Ti-lous!', texte:'Bonjour à tous! Bienvenue sur notre plateforme. N\'hésitez pas à nous contacter.', heure:'Aujourd\'hui' }
  ],
  presences: {},
  config: { mdp: 'garderie123' }
};

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      // S'assurer que toutes les collections existent
      Object.keys(DEFAULTS).forEach(k => {
        if (data[k] === undefined) data[k] = DEFAULTS[k];
      });
      return data;
    }
  } catch(e) {}
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db));
    return true;
  } catch(e) {
    return false;
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const params = event.queryStringParameters || {};
  const action = params.action;
  const col = params.col;

  try {
    const db = loadDB();

    // GET - lire une collection
    if (event.httpMethod === 'GET' && action === 'getAll') {
      const data = db[col] || [];
      const result = Array.isArray(data) ? data : Object.values(data);
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // GET - lire un document
    if (event.httpMethod === 'GET' && action === 'getDoc') {
      const id = params.id;
      let doc = null;
      if (Array.isArray(db[col])) {
        doc = db[col].find(x => String(x.id) === String(id));
      } else {
        doc = db[col]?.[id] || null;
      }
      return { statusCode: 200, headers, body: JSON.stringify(doc) };
    }

    // POST - ajouter un document
    if (event.httpMethod === 'POST' && action === 'add') {
      const body = JSON.parse(event.body || '{}');
      const newId = generateId();
      body.id = newId;
      if (!Array.isArray(db[col])) db[col] = [];
      db[col].push(body);
      saveDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ id: newId }) };
    }

    // PUT - mettre à jour un document
    if (event.httpMethod === 'PUT' && action === 'set') {
      const id = params.id;
      const body = JSON.parse(event.body || '{}');
      body.id = id;
      if (!Array.isArray(db[col])) db[col] = [];
      const idx = db[col].findIndex(x => String(x.id) === String(id));
      if (idx >= 0) {
        db[col][idx] = body;
      } else {
        db[col].push(body);
      }
      saveDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // PUT - mettre à jour partiellement
    if (event.httpMethod === 'PUT' && action === 'update') {
      const id = params.id;
      const body = JSON.parse(event.body || '{}');
      if (!Array.isArray(db[col])) db[col] = [];
      const idx = db[col].findIndex(x => String(x.id) === String(id));
      if (idx >= 0) {
        db[col][idx] = { ...db[col][idx], ...body };
      }
      saveDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // DELETE - supprimer un document
    if (event.httpMethod === 'DELETE' && action === 'delete') {
      const id = params.id;
      if (Array.isArray(db[col])) {
        db[col] = db[col].filter(x => String(x.id) !== String(id));
      }
      saveDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // GET config / mdp responsable
    if (event.httpMethod === 'GET' && action === 'getConfig') {
      return { statusCode: 200, headers, body: JSON.stringify(db.config || { mdp: 'garderie123' }) };
    }

    // GET presences d'un jour
    if (event.httpMethod === 'GET' && action === 'getPresences') {
      const date = params.date;
      const pres = db.presences?.[date] || {};
      return { statusCode: 200, headers, body: JSON.stringify(pres) };
    }

    // PUT presences d'un jour
    if (event.httpMethod === 'PUT' && action === 'setPresences') {
      const date = params.date;
      const body = JSON.parse(event.body || '{}');
      if (!db.presences) db.presences = {};
      db.presences[date] = body;
      saveDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // GET chat d'un parent
    if (event.httpMethod === 'GET' && action === 'getChat') {
      const parentId = params.parentId;
      const chat = db.chats?.[parentId] || { parentId, messages: [] };
      return { statusCode: 200, headers, body: JSON.stringify(chat) };
    }

    // PUT chat d'un parent
    if (event.httpMethod === 'PUT' && action === 'setChat') {
      const parentId = params.parentId;
      const body = JSON.parse(event.body || '{}');
      if (!db.chats) db.chats = {};
      db.chats[parentId] = body;
      saveDB(db);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Action inconnue: ' + action }) };

  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
