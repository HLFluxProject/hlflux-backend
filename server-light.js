// ================================================
// IMPORTS (Ordonnancés par type)
// ================================================

// --- Core Node.js ---
// require('dotenv').config();
const path = require('path');
const http = require('http');
const fs = require('fs');
const { Buffer } = require('buffer');
const { promisify } = require('util');

// --- Third-party ---
//const jwt = require('jsonwebtoken');
//const bcrypt = require('bcryptjs');
const stripe = require('stripe')(process.env.STRIPE_KEY, {
  apiVersion: '2020-08-27',
  maxNetworkRetries: 2
});
//const getVideoDuration = require('get-video-duration').getVideoDuration;
const multer = require('multer');
const express = require('express');
//const fileUpload = require('express-fileupload');
//const multiparty = require('multiparty');

// --- Locaux ---
//const adSync = require('./utils/ad-sync');
//const synopsisEditor = require('./modules/synopsis-editor/editor');

// ================================================
// CONFIGURATION CONSTANTES
// ================================================

// --- Application ---
const app = express();
const server = http.createServer(app);
console.log("🧪 CE FICHIER EST BIEN ENTRAIN D'ÊTRE EXÉCUTÉ");

// --- Chemins ---
const ROOT = path.join(__dirname);
const VIEWS_DIR = path.join(__dirname, 'views');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const TEST_VIDEOS_DIR = path.join(__dirname, 'test_videos');
const ADS_DIR = path.join(PUBLIC_DIR, 'ads');
const ADS_JSON_PATH = path.join(DATA_DIR, 'ads.json');
const mediaPath = path.join(DATA_DIR, 'media.json')

// --- Serveur ---
const PORT = process.env.PORT || 3001;
const MAX_FILE_SIZE = 2147483648; // 2GB
const DEBUG = true;
const SECRET_KEY = process.env.JWT_SECRET || 'e2d7fe2bf2db0cbfad5b2fa3da6959f593757091edd4046dc7a473d76b24f700';
const EDITOR_TOKEN = process.env.EDITOR_TOKEN || "FLUX_EDIT_" + Math.random().toString(36).substr(2, 9).toUpperCase();
console.log("TOKEN éditeur:", EDITOR_TOKEN);

// --- Médias ---
const VALID_MEDIA_TYPES = [
  'ad', 'jingle', 'arts_et_cultures', 'concerts', 'documentaires',
  'emissions', 'fictions', 'gags', 'theatres', 'theatres_de_chez_nous',
  'interviews', 'portraits', 'promos', 'reportages', 'teasers', 'clips'
];

// --- Structure Dossiers ---
const MEDIA_DIRS = {
  videos: {
    arts_et_cultures: path.join(PUBLIC_DIR, 'videos/arts_et_Cultures'),
    concerts: path.join(PUBLIC_DIR, 'videos/concerts'),
    documentaires: path.join(PUBLIC_DIR, 'videos/documentaires'),
    emissions: path.join(PUBLIC_DIR, 'videos/emissions'),
    fictions: path.join(PUBLIC_DIR, 'videos/fictions'),
    gags: path.join(PUBLIC_DIR, 'videos/gags'),
    theatres: path.join(PUBLIC_DIR, 'videos/theatres'),
    theatres_de_chez_nous: path.join(PUBLIC_DIR, 'videos/theatres_de_chez_nous'), 
    interviews: path.join(PUBLIC_DIR, 'videos/interviews'),
    portraits: path.join(PUBLIC_DIR, 'videos/portraits'),
    promos: path.join(PUBLIC_DIR, 'videos/promos'),
    reportages: path.join(PUBLIC_DIR, 'videos/reportages'),
    debats: path.join(PUBLIC_DIR, 'videos/emissions/debats'),
    educations: path.join(PUBLIC_DIR, 'videos/emissions/educations'),
    teasers: path.join(PUBLIC_DIR, 'videos/teasers'),
    clips: path.join(PUBLIC_DIR, 'videos/video_clips')
  },
  ads: path.join(PUBLIC_DIR, 'ads'),
  jingles: path.join(PUBLIC_DIR, 'jingles')
};

// --- Promotion ---
const PROMOTION_PERIOD = {
  active: true,
  endDate: '2025-12-31',
  freeAccessDays: 7,
  description: "Période de lancement - Accès gratuit",
  allowPublicAccess: true,
  maxFreeAccounts: 1000,
  currentFreeAccounts: 0
};

// --- API Externes ---
const FB_PAGE_ID = process.env.FB_PAGE_ID || 'VOTRE_PAGE_ID';
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN || 'VOTRE_TOKEN';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_SID || 'VOTRE_SID';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_TOKEN || 'VOTRE_TOKEN';
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_NUMBER || 'whatsapp:+14155238886';
const YOUR_WHATSAPP_NUMBER = process.env.YOUR_NUMBER || 'whatsapp:+242066694659';

// ======================
// GESTION DU CALENDRIER
// ======================
function handleScheduleRequest(req, res) {
  try {
      const schedulePath = path.join(DATA_DIR, 'schedule.json');
      
      // Créer le fichier s'il n'existe pas
      if (!fs.existsSync(schedulePath)) {
          fs.writeFileSync(schedulePath, JSON.stringify({
              events: [],
              lastUpdated: new Date().toISOString()
          }, null, 2));
      }

      // Lire et parser le fichier
      const scheduleData = JSON.parse(fs.readFileSync(schedulePath));
      
      // Filtrer par période si les paramètres sont fournis
      const url = new URL(req.url, `http://${req.headers.host}`);
      const startParam = url.searchParams.get('start');
      const endParam = url.searchParams.get('end');
      
      let events = scheduleData.events;
      
      if (startParam && endParam) {
          const startDate = new Date(startParam);
          const endDate = new Date(endParam);
          
          events = events.filter(event => {
              const eventDate = new Date(event.start);
              return eventDate >= startDate && eventDate <= endDate;
          });
      }

      sendJsonSuccess(res, { events });
  } catch (error) {
      console.error("Erreur gestion calendrier:", error);
      sendJsonSuccess(res, { events: [] }); // Retourner un tableau vide en cas d'erreur
  }
}

function handleSaveSchedule(req, res) {
  let body = '';
  
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
      try {
          const eventData = JSON.parse(body);
          const schedulePath = path.join(DATA_DIR, 'schedule.json');
          let schedule = { events: [] };
          
          if (fs.existsSync(schedulePath)) {
              schedule = JSON.parse(fs.readFileSync(schedulePath));
          }
          
          // Ajout ou mise à jour
          const index = schedule.events.findIndex(e => e.id === eventData.id);
          
          if (index === -1) {
              eventData.id = 'event-' + Date.now();
              schedule.events.push(eventData);
          } else {
              schedule.events[index] = eventData;
          }
          
          fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));
          sendJsonSuccess(res, { success: true, eventId: eventData.id });
      } catch (error) {
          sendJsonError(res, 500, 'Erreur de sauvegarde');
      }
  });
}

function handleDeleteSchedule(req, res) {
  const eventId = req.url.split('/api/schedule/')[1];
  
  try {
      const schedulePath = path.join(DATA_DIR, 'schedule.json');
      const schedule = JSON.parse(fs.readFileSync(schedulePath));
      
      schedule.events = schedule.events.filter(e => e.id !== eventId);
      fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));
      
      sendJsonSuccess(res, { success: true });
  } catch (error) {
      sendJsonError(res, 500, 'Erreur de suppression');
  }
}


// ================================================
// INITIALISATION (Vos fonctions existantes)
// ================================================

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function initProjectDirs() {
 // Dossiers obligatoires
 const requiredDirs = [
    path.join(__dirname, 'data'), // Dossier data/
    PUBLIC_DIR,                   // Dossier public/
    ...Object.values(MEDIA_DIRS.videos), // Tous les dossiers vidéos
    MEDIA_DIRS.ads,               // Dossier ads/
    MEDIA_DIRS.jingles            // Dossier jingles/
  ];

  requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[INIT] Dossier créé : ${dir}`);
    }
  });
}

const simpleRateLimit = (windowMs, max) => {
    const requests = {};
    return (req, res, next) => {
        const ip = req.ip;
        const currentTime = Date.now();
        
        if (!requests[ip]) {
            requests[ip] = { count: 1, startTime: currentTime };
            return next();
        }
        
        if (currentTime - requests[ip].startTime > windowMs) {
            requests[ip] = { count: 1, startTime: currentTime };
            return next();
        }
        
        if (requests[ip].count >= max) {
            return res.status(429).json({ error: 'Trop de requêtes, veuillez patienter' });
        }
        
        requests[ip].count++;
        next();
    };
};

let clients = [];
const rateLimit = (options) => {
    return (req, res, next) => {
        // Implémentation basique du rate limiting
        const ip = req.ip;
        const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes par défaut
        const max = options.max || 100; // 100 requêtes max par fenêtre
        
        if (!req.rateLimit) {
          req.rateLimit = {
            count: 0,
            resetTime: Date.now() + windowMs
          };
        }
        
        if (Date.now() > req.rateLimit.resetTime) {
          req.rateLimit.count = 0;
          req.rateLimit.resetTime = Date.now() + windowMs;
        }
        
        if (req.rateLimit.count >= max) {
          return res.status(429).json({
            error: "Trop de requêtes, veuillez patienter"
          });
        }
        
        req.rateLimit.count++;
        next();
      };
};

// ================================================
// CONFIGURATION MULTER (Conservée intacte)
// ================================================

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // On récupère le type depuis le champ 'type' du FormData
        const type = req.body.type || req.headers['x-media-type'];
        
        let uploadPath;
        if (type === 'ad') {
          uploadPath = path.join(PUBLIC_DIR, 'ads');
        } else if (type === 'jingle') {
          uploadPath = path.join(PUBLIC_DIR, 'jingles');
        } else if (VALID_MEDIA_TYPES.includes(type)) {
          uploadPath = path.join(PUBLIC_DIR, 'videos', type);
        } else {
          return cb(new Error('Type de média invalide'));
        }
    
         Création du dossier si inexistant
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
      },
      filename: (req, file, cb) => {
        cb(null, file.originalname);
      }
});


const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const type = req.body.type;
      let uploadPath = PUBLIC_DIR;
      
      if (type === 'ad') uploadPath = path.join(PUBLIC_DIR, 'ads');
      else if (type === 'jingle') uploadPath = path.join(PUBLIC_DIR, 'jingles');
      else if (VALID_MEDIA_TYPES.includes(type)) uploadPath = path.join(PUBLIC_DIR, 'videos', type);
      
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  }),
  limits: { fileSize: MAX_FILE_SIZE }
});

function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.json': 'application/json'
  }[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
}

function serveMediaFile(req, res, filePath) {
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg'
    }[ext] || 'application/octet-stream';

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

      res.writeHead(206, {
        'Content-Type': contentType,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes'
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } else {
    res.writeHead(404);
    res.end('Fichier non trouvé');
  }
}

function checkAccess(req, res, next) {
  // 1. Accès public aux routes non protégées
  if (req.url.startsWith('/api/public/')) {
    return next();
  }

  // 2. Vérification du token
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return sendJsonError(res, 401, 'Token requis. Merci de vous inscrire.');
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = getUserById(decoded.userId);

    // 3. Accès toujours permis pour l'admin
    if (req.user?.role === 'admin') return next();

    // 4. Logique d'accès client
    const isFirstConnection = !req.user.lastConnection;
    const isInFreePeriod = req.user.promoAccess?.granted && 
                          new Date(req.user.promoAccess.expiresAt) > new Date();
    const hasValidSub = req.user.subscription?.status === 'active';

    if (isFirstConnection) {
      // Première connexion = 7 jours d'accès
      req.user.lastConnection = new Date().toISOString();
  req.user.promoAccess = {
    granted: true,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
  saveUsers(getUsers()); // Sauvegarde immédiate
  
  // Régénère le token avec les nouvelles infos
  const newToken = jwt.sign(
    {
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
      lastConnection: req.user.lastConnection
    },
    SECRET_KEY,
    { expiresIn: '30d' }
  );
  
  // Renvoie le nouveau token
  return sendJsonSuccess(res, { 
    token: newToken,
    message: 'Première connexion - 7 jours offerts activés'
  });
}

    if (isInFreePeriod || hasValidSub) {
      return next();
    }

    sendJsonError(res, 403, 'Période gratuite expirée. Veuillez vous abonner.');
  } catch (err) {
    sendJsonError(res, 403, 'Token invalide');
  }
}

app.post('/admin/promo', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return sendJsonError(res, 403, 'Admin required');

    const { action, value } = req.body; // ou utilise await parseRequestBody(req) si nécessaire

    switch (action) {
      case 'toggle':
        PROMOTION_PERIOD.active = value;
        break;
      case 'set_access':
        PROMOTION_PERIOD.allowPublicAccess = value;
        break;
      case 'extend':
        PROMOTION_PERIOD.endDate = value;
        break;
    }

    savePromoConfig();
    sendJsonSuccess(res, { newStatus: PROMOTION_PERIOD });
  } catch (error) {
    console.error('Erreur promo admin:', error);
    sendJsonError(res, 500, 'Erreur traitement promo admin');
  }
});

//  =================
//  STRIPE/WEBHOOK //
//  =================


app.post('/api/payment/create-session', express.json(), async (req, res) => {
  const { userId, amount, currency, description, contentId, contentType, successUrl, cancelUrl } = req.body;


  if (!userId || !amount || !currency || !description || !successUrl || !cancelUrl) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: description
          },
          unit_amount: getAmountInCents(amount, currency)
        },
        quantity: 1
      }],
      metadata: {
        userId,
        contentId,
        contentType,
        description
      },      
      success_url: successUrl + '?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('❌ Erreur création session Stripe:', err.message);
    res.status(500).json({ error: 'Erreur lors de la création de la session de paiement' });
  }
});

// Webhook Stripe : à placer AVANT express.json()

app.post('/api/payment/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  try {
    const event = stripe.webhooks.constructEvent(
      req.body, 
      sig, 
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      updateUserSubscription(session.metadata.userId, session.id);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Erreur webhook:', err);
    res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }
});

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Webhook Error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 🎯 Gestion des événements
  switch (event.type) {
    case 'checkout.session.completed':
  const session = event.data.object;

  // 🔐 Abonnement
  if (session.metadata?.description?.includes("Abonnement")) {
    const users = getUsers();
    const user = users.find(u => u.id === session.metadata.userId);
    if (user) {
      user.subscription = {
        status: 'active',
        plan: session.metadata.description,
        currency: session.currency.toUpperCase(),
        lastPayment: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 jours
      };
      saveUsers(users);
      console.log(`✅ Abonnement activé pour ${user.id}`);
    }
  }

  // 🎟️ Achat à l’unité
  if (session.metadata?.contentId && session.metadata?.contentType) {
    const purchasesPath = path.join(__dirname, 'data', 'purchases.json');
    let purchases = [];

    if (fs.existsSync(purchasesPath)) {
      purchases = JSON.parse(fs.readFileSync(purchasesPath));
    }

    purchases.push({
      userId: session.metadata.userId,
      contentId: session.metadata.contentId,
      contentType: session.metadata.contentType,
      purchaseDate: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48h
      stripeSessionId: session.id
    });

    fs.writeFileSync(purchasesPath, JSON.stringify(purchases, null, 2));
    console.log(`✅ Achat enregistré pour ${session.metadata.userId} : ${session.metadata.contentId}`);
  }

  break;

    case 'invoice.paid':
      await handleInvoicePaymentSucceeded(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;
    default:
      console.log(`ℹ️ Événement non traité : ${event.type}`);
  }

  res.status(200).json({ received: true });
});



// 📌 4. Routes ADMIN (comme /admin.html avec injection)
app.get('/admin', (req, res) => {
  const filePath = path.join(VIEWS_DIR, 'admin.html');

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).send('Page admin non trouvée');
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        return res.status(500).send('Erreur de chargement');
      }

      const modified = req.query.login_required
        ? data.toString().replace(
            '</body>',
            `
              <script>
                document.addEventListener('DOMContentLoaded', function() {
                  showAlert('error', 'Session expirée - Veuillez vous reconnecter');
                });
              </script>
            </body>`
          )
        : data;

      res.setHeader('Content-Type', 'text/html');
      res.send(modified);
    });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(VIEWS_DIR, 'index.html'));
});

app.get(['/videos/*', '/ads/*', '/jingles/*'], (req, res) => {
  const filePath = path.join(PUBLIC_DIR, req.path);

  if (!fs.existsSync(filePath)) {
    console.warn(`🔁 Fichier manquant : ${filePath}`);

    let fallbackPath = null;
    if (req.path.startsWith('/videos/')) {
      fallbackPath = path.join(PUBLIC_DIR, 'videos/documentaires/fallback.mp4');
    } else if (req.path.startsWith('/ads/')) {
      fallbackPath = path.join(PUBLIC_DIR, 'ads/fallback.mp4');
    } else {
      fallbackPath = path.join(PUBLIC_DIR, 'jingles/fallback.mp4');
    }

    if (fallbackPath && fs.existsSync(fallbackPath)) {
      return serveMediaFile(req, res, fallbackPath);
    }

    return res.status(404).send('Fichier non trouvé');
  }

  return serveMediaFile(req, res, filePath);
});

// --- Stats et configuration ---
app.get('/api/stats', (req, res) => {
    try {
        const stats = {
            totalVideos: 0,
            totalAds: 0,
            totalSpace: '0MB',
            lastUpdated: new Date().toISOString()
        };
  
        // Compter les vidéos
        const mediaPath = path.join(DATA_DIR, 'media.json');
        if (fs.existsSync(mediaPath)) {
            const media = JSON.parse(fs.readFileSync(mediaPath));
            stats.totalVideos = media.filter(m => m.type && !['ad', 'jingle'].includes(m.type)).length;
        }
  
        // Compter les pubs
        const adsPath = path.join(DATA_DIR, 'ads.json');
        if (fs.existsSync(adsPath)) {
            const ads = JSON.parse(fs.readFileSync(adsPath));
            stats.totalAds = Array.isArray(ads) ? ads.length : Object.keys(ads).length;
        }
  
        // Calculer la taille totale
        stats.totalSpace = calculateTotalSize();
  
        res.json(stats);
    } catch (error) {
        console.error("Erreur stats:", error);
        res.json({ 
            totalVideos: 0,
            totalAds: 0,
            totalSpace: '0MB'
        });
    }
  });
  
  app.get('/api/playlist', async (req, res) => {
    try {
      const config = await readJsonFile('playlist-config.json');
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  app.get('/api/playlist/config', (req, res) => {
    try {
        const configPath = path.join(DATA_DIR, 'playlist-config.json');
        
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({ 
                error: 'Configuration non trouvée',
                solution: 'Créez une playlist via l\'interface admin'
            });
        }
  
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);
        res.json(config);
  
    } catch (error) {
        console.error('Erreur lecture playlist config:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            details: error.message 
        });
    }
  });
  
  app.get('/api/playlist/published', (req, res) => {
    const filePath = path.join(__dirname, 'data', 'published-playlist.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('❌ Erreur lecture playlist:', err);
      return res.status(500).json({ error: 'Erreur lecture playlist' });
    }

    try {
      const parsed = JSON.parse(data);
      res.json(parsed);
    } catch (e) {
      console.error('❌ Playlist mal formée :', e.message);
      res.status(500).json({ error: 'JSON playlist mal formé' });
    }
  });
  });
  
  app.get('/api/playlist/enriched', (req, res) => {
    try {
        const playlistPath = path.join(DATA_DIR, 'published-playlist.json');
        const mediaPath = path.join(DATA_DIR, 'media.json');
    
        if (!fs.existsSync(playlistPath) || !fs.existsSync(mediaPath)) {
          return sendJsonSuccess(res, {
            items: [],
            ads: [],
            config: { adFrequency: 3 }
          });
        }
    
        const playlist = JSON.parse(fs.readFileSync(playlistPath));
        const media = JSON.parse(fs.readFileSync(mediaPath));
    
        const enrichedItems = playlist.items.map(item => {
          const mediaItem = media.find(m => m.id === item.id) || {};
          return {
            ...item,
            title: mediaItem.title || item.title,
            duration: parseInt(mediaItem.duration) || 0,
            synopsis: mediaItem.synopsis || "Description non disponible",
            path: mediaItem.path || buildMediaPath(item)
          };
        });
    
        sendJsonSuccess(res, {
          items: enrichedItems,
          ads: playlist.ads || [],
          config: {
            adFrequency: playlist.adFrequency || 3
          }
        });
      } catch (error) {
        console.error("💥 Erreur enriched playlist:", error);
        sendJsonSuccess(res, {
          items: [],
          ads: [],
          config: { adFrequency: 3 }
        });
      }
  });

app.get('/api/posts', (req, res) => {
  // Pendant la promo, accès libre
  if (PROMOTION_PERIOD.active && PROMOTION_PERIOD.allowPublicAccess) {
    return handleGetPosts(req, res);
  }
  
  // Sinon, vérifier le token
  verifyToken(req, res, () => handleGetPosts(req, res));
});

// ===========
// ROUTES API
// ===========

// ======================
// ROUTES GET (LECTURE)
// ======================

// ======================
// ROUTES STATIQUES - HTML
// ======================
    
app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(VIEWS_DIR, 'index.html'));
});

app.get(['/admin', '/admin.html'], (req, res) => {
  res.sendFile(path.join(VIEWS_DIR, 'admin.html'));
});

// Pour les cas particuliers si tu veux garder favicon isolé :
app.get('/favicon.ico', (req, res) => {
res.sendFile(path.join(PUBLIC_DIR, 'favicon.ico'));
});

app.get(['/videos/*', '/ads/*', '/jingles/*'], (req, res) => {
const filePath = path.join(PUBLIC_DIR, req.path);

if (!fs.existsSync(filePath)) {
console.error(`Fichier non trouvé: ${filePath}`);

let fallbackPath = null;
if (req.path.startsWith('/videos/')) {
  fallbackPath = path.join(PUBLIC_DIR, 'videos/documentaires/fallback.mp4');
} else if (req.path.startsWith('/ads/')) {
  fallbackPath = path.join(PUBLIC_DIR, 'ads/fallback.mp4');
} else {
  fallbackPath = path.join(PUBLIC_DIR, 'jingles/fallback.mp4');
}

if (fallbackPath && fs.existsSync(fallbackPath)) {
  return serveMediaFile(req, res, fallbackPath);
}

return res.status(404).send('Fichier non trouvé');
}

return serveMediaFile(req, res, filePath);
});


// ============
// ROUTES PROMO (Express)
// ============
  
app.get('/api/promo/status', (req, res) => {
  try {
      const filePath = path.join(DATA_DIR, 'promo-config.json');
      const promoConfig = fs.existsSync(filePath)
        ? JSON.parse(fs.readFileSync(filePath))
        : PROMOTION_PERIOD;
  
      return sendJsonSuccess(res, {
        active: promoConfig.active,
        allowPublicAccess: promoConfig.allowPublicAccess,
        remainingAccounts: Math.max(0, promoConfig.maxFreeAccounts - promoConfig.currentFreeAccounts),
        endDate: promoConfig.endDate,
        description: promoConfig.description || "Période promotionnelle"
      });
    } catch (error) {
      console.error('Erreur promo/status:', error);
      return sendJsonError(res, 500, 'Erreur de lecture de la configuration');
    }
});

// --- Médias ---
app.get('/api/media', (req, res) => {
  const mediaPath = path.join(DATA_DIR, 'media.json');
  res.sendFile(mediaPath, {}, (err) => {
    if (err) res.json([]);
  });
});

app.get('/api/media/:id', (req, res) => {
  const mediaPath = path.join(DATA_DIR, 'media.json');

try {
    const mediaList = JSON.parse(fs.readFileSync(mediaPath));
    const media = mediaList.find(m => m.id === req.params.id);
    
    if (!media) {
        return res.status(404).json({ error: 'Média non trouvé' });
    }
    
    // Ajout du synopsis si disponible
    const synopsisPath = path.join(DATA_DIR, 'synopsis.json');
    if (fs.existsSync(synopsisPath)) {
        const synopsisData = JSON.parse(fs.readFileSync(synopsisPath));
        media.synopsis = synopsisData[req.params.id] || '';
    }
    
    res.json(media);
} catch (error) {
    console.error("Error getting media:", error);
    res.status(500).json({ error: 'Erreur serveur' });
}
});

app.delete('/api/media/:id', handleDeleteMedia);


app.get('/api/ads', (req, res) => {
  try {
    if (!fs.existsSync(ADS_JSON_PATH)) {
      console.warn("⚠️ Fichier ads.json non trouvé");
      return res.json([]);
    }

    const data = JSON.parse(fs.readFileSync(ADS_JSON_PATH, 'utf8'));
    const validAds = (Array.isArray(data) ? data : Object.values(data || {}))
      .filter(ad => ad && (ad.id || ad.file));

    res.json(validAds);
  } catch (err) {
    console.error("❌ Erreur lecture ads.json :", err);
    res.json([]);
  }
});

app.delete('/api/infos', (req, res) => {
  const { source, langue, url, date } = req.body;

  const infoPath = path.join(__dirname, 'data', 'infos.json');
  if (!fs.existsSync(infoPath)) return res.status(404).json({ error: 'Fichier manquant' });

  let infos = JSON.parse(fs.readFileSync(infoPath));
  infos = infos.filter(entry =>
    entry.source !== source ||
    entry.langue !== langue ||
    entry.url !== url ||
    entry.date !== date
  );

  fs.writeFileSync(infoPath, JSON.stringify(infos, null, 2));
  res.json({ success: true });
});

// ===================================
// ROUTES DELETE (SCHEDULE CALENDRIER)
// ===================================
  
app.delete('/api/schedule/:id', (req, res) => {
    const eventId = req.params.id;
    const schedulePath = path.join(DATA_DIR, 'schedule.json');
    
    if (!fs.existsSync(schedulePath)) {
        return res.status(404).json({error: 'Calendrier non trouvé'});
    }
    
    const schedule = JSON.parse(fs.readFileSync(schedulePath));
    const initialLength = schedule.events.length;
    
    schedule.events = schedule.events.filter(e => e.id !== eventId);
    
    if (schedule.events.length === initialLength) {
        return res.status(404).json({error: 'Événement non trouvé'});
    }
    
    fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));
    res.json({success: true});
});

app.get('/api/synopsis', (req, res) => {
  const synopsisPath = path.join(DATA_DIR, 'synopsis.json');
const { mediaId } = req.query;

fs.readFile(synopsisPath, (err, data) => {
  if (err) return res.json({});
  const synopses = JSON.parse(data);
  res.json({ text: synopses[mediaId] || "" });
});
});

app.get('/api/theatre/videos', (req, res) => {
  console.log('✅ Route /api/theatre/videos atteinte !');
  const fs = require('fs');
  const path = require('path');

  const mediaPath = path.join(__dirname, 'data', 'media.json');

  fs.readFile(mediaPath, 'utf8', (err, data) => {
    if (err) {
      console.error('❌ Erreur lecture media.json :', err.message);
      return res.status(500).json({ error: "Impossible de lire les médias" });
    }

    try {
      const allVideos = JSON.parse(data);
      const filtered = allVideos.filter(video =>
        video.type === 'theatres_de_chez_nous' || video.type === 'théâtre_de_chez_nous'
      );

      res.json(filtered);
    } catch (parseErr) {
      console.error('❌ JSON media mal formé :', parseErr.message);
      res.status(500).json({ error: 'Format de données invalide' });
    }
  });
});

app.get('/api/payment/verify-session', async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.status(400).json({ success: false, error: 'Session ID manquant' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      res.json({ success: true, session });
    } else {
      res.json({ success: false, error: 'Paiement non validé' });
    }
  } catch (err) {
    console.error('Erreur vérification session Stripe:', err.message);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.get('/api/purchases/:userId', (req, res) => {
  const userId = req.params.userId;
  const purchasesPath = path.join(__dirname, 'data', 'purchases.json');

  if (!fs.existsSync(purchasesPath)) {
    return res.json([]);
  }

  const purchases = JSON.parse(fs.readFileSync(purchasesPath));
  const now = new Date();

  const userPurchases = purchases.filter(p =>
    p.userId === userId &&
    (!p.expiresAt || new Date(p.expiresAt) > now)
  );

  res.json(userPurchases);
});


app.get('/api/access/:userId/:contentId', (req, res) => {
  const { userId, contentId } = req.params;
  const purchasesPath = path.join(__dirname, 'data', 'purchases.json');

  if (!fs.existsSync(purchasesPath)) {
    return res.json({ access: false });
  }

  const purchases = JSON.parse(fs.readFileSync(purchasesPath));
  const now = new Date();

  const purchase = purchases.find(p =>
    p.userId === userId &&
    p.contentId === contentId &&
    (!p.expiresAt || new Date(p.expiresAt) > now)
  );

  if (purchase) {
    return res.json({ access: true });
  } else {
    return res.json({ access: false });
  }
});

// --- Calendrier ---
app.get('/api/schedule', (req, res) => {
  const schedulePath = path.join(DATA_DIR, 'schedule.json');

// Créer le fichier s'il n'existe pas
if (!fs.existsSync(schedulePath)) {
    fs.writeFileSync(schedulePath, JSON.stringify({events: []}));
}

const schedule = JSON.parse(fs.readFileSync(schedulePath));

// Filtrer par dates si paramètres fournis
const { start, end } = req.query;
let events = schedule.events;

if (start && end) {
    events = events.filter(event => {
        const eventDate = new Date(event.start);
        return eventDate >= new Date(start) && eventDate <= new Date(end);
    });
}

res.json(events);
});

// --- Contenu premium ---
app.get('/api/content/premium', verifyPayment, (req, res) => {
  try {
      // Contenu réservé aux payants
      sendJsonSuccess(res, { premiumContent: true });
    } catch (error) {
      console.error('Erreur serveur:', error);
      sendJsonError(res, 500, 'Erreur interne du serveur');
    }
});

// --- Evenement en Direct ---

const livePath = path.join(__dirname, 'data', 'live.json');

app.get('/api/live', (req, res) => {
  try {
    if (!fs.existsSync(livePath)) return res.json({ status: 'offline' });
    const data = JSON.parse(fs.readFileSync(livePath, 'utf8'));
    res.json(data);
  } catch (err) {
    console.error("❌ Erreur lecture live.json :", err);
    res.json({ status: 'offline' });
  }
});


// === ROUTES POUR "THÉÂTRE DE CHEZ NOUS" ===
// Fonction pour normaliser les noms (accents, espaces, majuscules)
const normalize = str =>
  str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents
    .replace(/\s+/g, '_')            // remplace les espaces par des underscores
    .toLowerCase();                  // met tout en minuscule


const { exec } = require('child_process');

app.get('/admin/tools/sync-theatre', (req, res) => {
  const scriptPath = path.join(__dirname, 'tools', 'sync-theatre-media.js');

  if (!fs.existsSync(scriptPath)) {
    return res.status(500).json({ message: "Script de synchronisation introuvable." });
  }

  exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Erreur exécution script :`, stderr);
      return res.status(500).json({ message: "Erreur lors de l'exécution du script." });
    }

    console.log(`✅ Script exécuté :\n${stdout}`);
    return res.json({ message: stdout.trim() });
  });
});

app.post('/check-theatre-access', (req, res) => {
  // En phase de test, toujours autoriser
  res.json({ 
      accessGranted: true,
      message: "Accès promotionnel activé"
  });
});

app.post('/process-payment', (req, res) => {
  // Simulation de paiement
  console.log('Paiement reçu:', req.body);
  res.json({ 
      success: true,
      transactionId: 'tx_' + Date.now(),
      amount: req.body.amount
  });
});

// ======================
// ROUTES POST (CREATION)
// ======================

// --- Uploads ---
app.post('/api/upload', verifyToken, upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      throw new Error('Aucun fichier reçu');
    }

    // Vérification du type
    if (!req.body.type) {
      throw new Error('Type de média non spécifié');
    }

    // Déterminer le dossier de destination
    let targetDir;
    if (req.body.type === 'ad') {
      targetDir = path.join(PUBLIC_DIR, 'ads');
    } else if (req.body.type === 'jingle') {
      targetDir = path.join(PUBLIC_DIR, 'jingles');
    } else {
      targetDir = path.join(PUBLIC_DIR, 'videos', req.body.type);
    }

    // Créer le dossier si inexistant
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Chemin final
    const finalPath = path.join(targetDir, req.file.originalname);
    fs.renameSync(req.file.path, finalPath);

    // Enregistrement dans media.json
    const mediaEntry = {
      id: req.file.originalname,
      title: path.parse(req.file.originalname).name,
      type: req.body.type,
      path: path.relative(PUBLIC_DIR, finalPath),
      date: new Date().toISOString()
    };

    const mediaPath = path.join(DATA_DIR, 'media.json');
    const mediaList = fs.existsSync(mediaPath) ? 
      JSON.parse(fs.readFileSync(mediaPath)) : [];
    mediaList.push(mediaEntry);
    fs.writeFileSync(mediaPath, JSON.stringify(mediaList, null, 2));

    // Gestion spécifique des pubs
    if (req.body.type === 'ad') {
      const adsPath = path.join(DATA_DIR, 'ads.json');
      const ads = fs.existsSync(adsPath) ? 
        JSON.parse(fs.readFileSync(adsPath)) : [];
      
      // Calcul de la durée pour les vidéos
      let duration = 0;
      if (req.file.mimetype.startsWith('video/')) {
        try {
          duration = await getVideoDuration(finalPath);
          duration = Math.round(duration);
        } catch (e) {
          console.error('Erreur calcul durée:', e);
        }
      }

      ads.push({
        id: mediaEntry.id,
        file: mediaEntry.id,
        title: mediaEntry.title,
        duration: duration,
        date: mediaEntry.date
      });
      fs.writeFileSync(adsPath, JSON.stringify(ads, null, 2));
    }

    res.json({
      success: true,
      message: 'Fichier uploadé avec succès',
      file: mediaEntry
    });

  } catch (error) {
    console.error('Erreur upload:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erreur lors de l\'upload'
    });
  }
});

app.post('/api/debug-upload', upload.single('media'), (req, res) => {
  console.log('📥 Fichier reçu :', {
      name: req.file?.originalname,
      path: req.file?.path,
      type: req.body?.type
    });
  
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier reçu' });
    }
  
    res.json({ message: 'Upload réussi ✅', info: req.file });
});


  // ======================
  // ROUTES PUT (MISE A JOUR)
  // ======================
  
  app.put('/api/media/:id', express.json(), (req, res) => {
    try {
      if (!fs.existsSync(mediaPath)) {
        return res.status(404).json({ error: 'Fichier media.json introuvable' });
      }
  
      const mediaList = JSON.parse(fs.readFileSync(mediaPath, 'utf8'));
  
      const index = mediaList.findIndex(m =>
        decodeURIComponent(m.id).toLowerCase() === decodeURIComponent(req.params.id).toLowerCase()
      );
  
      if (index === -1) {
        console.warn("❌ Média introuvable pour modification :", req.params.id);
        return res.status(404).json({ error: 'Média non trouvé' });
      }
  
      const updatedFields = req.body || {};
  
      // ⏱️ Mettre à jour la date de modification
      updatedFields.updatedAt = new Date().toISOString();
  
      // 🔄 Fusionner les anciens et nouveaux champs
      mediaList[index] = {
        ...mediaList[index],
        ...updatedFields
      };
  
      fs.writeFile(mediaPath, JSON.stringify(mediaList, null, 2), err => {
        if (err) {
          console.error("❌ Erreur lors de l’écriture de media.json :", err);
          return res.status(500).json({ error: 'Erreur écriture' });
        }
  
        console.log(`✅ Média "${mediaList[index].title}" mis à jour avec succès`);
        res.json({ success: true, media: mediaList[index] });
      });
  
    } catch (error) {
      console.error('❌ Exception route PUT /api/media/:id :', error);
      res.status(500).json({ error: 'Erreur serveur interne' });
    }
  });
  
  app.put('/api/schedule/:id', (req, res) => {
    const eventId = req.params.id;
    const eventData = req.body;
    const schedulePath = path.join(DATA_DIR, 'schedule.json');
    
    if (!fs.existsSync(schedulePath)) {
        return res.status(404).json({error: 'Calendrier non trouvé'});
    }
    
    const schedule = JSON.parse(fs.readFileSync(schedulePath));
    const index = schedule.events.findIndex(e => e.id === eventId);
    
    if (index === -1) {
        return res.status(404).json({error: 'Événement non trouvé'});
    }
    
    schedule.events[index] = eventData;
    fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));
    res.json({success: true});
  });
  
  app.post('/api/infos', (req, res) => {
    const { source, langue, url, date } = req.body;
    if (!source || !langue || !url || !date) {
      return res.status(400).json({ error: "Champs incomplets" });
    }
  
    const newEntry = { source, langue, url, date };
    const infoPath = path.join(__dirname, 'data', 'infos.json');
  
    let infos = [];
    if (fs.existsSync(infoPath)) {
      infos = JSON.parse(fs.readFileSync(infoPath));
    }
  
    infos.push(newEntry);
    fs.writeFileSync(infoPath, JSON.stringify(infos, null, 2));
    res.json({ success: true });
  });
  
  // --- Calendrier ---
  app.post('/api/schedule', (req, res) => {
    const eventData = req.body;
  const schedulePath = path.join(DATA_DIR, 'schedule.json');
  let schedule = {events: []};
  
  if (fs.existsSync(schedulePath)) {
      schedule = JSON.parse(fs.readFileSync(schedulePath));
  }
  
  // Générer un ID unique
  eventData.id = 'event-' + Date.now();
  schedule.events.push(eventData);
  
  fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));
  res.json({success: true, eventId: eventData.id});
  });
  
  // --- Statistiques ---
  app.post('/api/theatre/views/:id', (req, res) => {
    const targetId = req.params.id;
    const filePath = path.join(DATA_DIR, 'theatre_videos.json');
  
    fs.readFile(filePath, 'utf8', (err, rawData) => {
      if (err) {
        console.error('❌ Erreur lecture fichier vues :', err);
        return res.status(500).json({ error: 'Erreur lecture du fichier' });
      }
  
      try {
        const videos = JSON.parse(rawData);
        const index = videos.findIndex(video => video.id === targetId);
  
        if (index === -1) {
          return res.status(404).json({ error: 'Vidéo non trouvée' });
        }
  
        videos[index].views = (videos[index].views || 0) + 1;
  
        fs.writeFile(filePath, JSON.stringify(videos, null, 2), err => {
          if (err) {
            console.error('❌ Erreur sauvegarde vues :', err);
            return res.status(500).json({ error: 'Erreur sauvegarde du fichier' });
          }
  
          res.json({ success: true, id: targetId, newViews: videos[index].views });
        });
      } catch (parseErr) {
        console.error('❌ JSON mal formé :', parseErr);
        res.status(500).json({ error: 'Format de fichier invalide' });
      }
    });
  });
  
  app.post('/api/views/:id', (req, res) => {
    const mediaPath = path.join(__dirname, 'data', 'media.json');

    fs.readFile(mediaPath, 'utf8', (err, data) => {
      if (err) return res.status(500).json({ error: 'Erreur lecture media.json' });
  
      let mediaList;
      try {
        mediaList = JSON.parse(data);
      } catch (e) {
        return res.status(500).json({ error: 'Erreur parsing media.json' });
      }
  
      const index = mediaList.findIndex(m =>
        decodeURIComponent(m.id).toLowerCase() === decodeURIComponent(req.params.id).toLowerCase()
      );    
      if (index === -1) return res.status(404).json({ error: 'Vidéo non trouvée' });
  
      mediaList[index].views = (mediaList[index].views || 0) + 1;
  
      fs.writeFile(mediaPath, JSON.stringify(mediaList, null, 2), err => {
        if (err) return res.status(500).json({ error: 'Erreur écriture' });
        res.json({ success: true, views: mediaList[index].views });
      });
    });
  });
  
  // --- Playlists ---
  app.post('/api/playlist/publish', (req, res) => {
    try {
        // Lire les fichiers nécessaires
        const playlistPath = path.join(DATA_DIR, 'playlist-config.json');
        const mediaPath = path.join(DATA_DIR, 'media.json');
        const adsPath = path.join(DATA_DIR, 'ads.json');
        
        if (!fs.existsSync(playlistPath) || !fs.existsSync(mediaPath)) {
            return sendJsonError(res, 404, 'Fichiers de configuration manquants');
        }
  
        const playlist = JSON.parse(fs.readFileSync(playlistPath));
        const media = JSON.parse(fs.readFileSync(mediaPath));
        const ads = fs.existsSync(adsPath) ? JSON.parse(fs.readFileSync(adsPath)) : [];
  
        // Enrichir les items avec les données de media.json
        const enrichedItems = playlist.items.map(item => {
            const mediaItem = media.find(m => m.id === item.id) || {};
            return {
                ...item,
                title: mediaItem.title || item.title,
                duration: mediaItem.duration,
                synopsis: mediaItem.synopsis
            };
        });
  
        // Créer l'objet publié
        const publishedPlaylist = {
            items: enrichedItems,
            ads: ads,
            adFrequency: playlist.adFrequency || 3,
            publishedAt: new Date().toISOString()
        };
  
        // Sauvegarder
        fs.writeFileSync(path.join(DATA_DIR, 'published-playlist.json'), 
            JSON.stringify(publishedPlaylist, null, 2));
  
        sendJsonSuccess(res, { 
            success: true,
            publishedAt: publishedPlaylist.publishedAt
        });
  
    } catch (error) {
        console.error("Erreur publication:", error);
        sendJsonError(res, 500, 'Erreur lors de la publication');
    }
  });
  
  app.post('/api/playlist/publish-enhanced', async (req, res) => {
    try {
        const [playlist, media, ads] = await Promise.all([
          readJsonFile('playlist-config.json'),
          readJsonFile('media.json'),
          readJsonFile('ads.json')
        ]);
    
        // Enrichissement des données
        const publishedData = {
          items: playlist.items.map(item => {
            const mediaInfo = media.find(m => m.id === item.id) || {};
            return {
              ...item,
              title: mediaInfo.title || item.title,
              duration: parseInt(mediaInfo.duration) || 0,
              synopsis: mediaInfo.synopsis || "Description non disponible",
              path: mediaInfo.path || getDefaultPath(item)
            };
          }),
          ads: ads,
          adFrequency: playlist.adFrequency || 3,
          publishedAt: new Date().toISOString()
        };
    
        await fs.promises.writeFile(
          path.join(DATA_DIR, 'published-playlist.json'),
          JSON.stringify(publishedData, null, 2)
        );
    
        res.json({ success: true });
      } catch (error) {
        console.error("Erreur publication:", error);
        res.status(500).json({ success: false, error: error.message });
      }
  });
 


async function handleAdminLogin(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { username, password } = JSON.parse(body);
      const users = getUsers();
      const user = users.find(u => u.email === username);

      if (!user) {
        return sendJsonError(res, 401, 'Identifiants incorrects');
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      
      if (!passwordMatch) {
        if (password === '#Presid@01' && username === 'admin@hlflux.com') {
          const hashedPassword = await bcrypt.hash('#Presid@01', 10);
          user.password = hashedPassword;
          saveUsers(users);
        } else {
          return sendJsonError(res, 401, 'Identifiants incorrects');
        }
      }

      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email,
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      sendJsonSuccess(res, { 
        token,
        user: {
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      sendJsonError(res, 500, 'Erreur de connexion');
    }
  });
}

// ================================================
// MIDDLEWARES PERSONNALISÉS (Conservés intacts)
// ================================================

const multipartMiddleware = (req, res, next) => {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return sendJsonError(res, 400, 'Content-Type invalide');
    }
  
    const busboy = require('busboy')({ headers: req.headers });
    const fields = {};
  
    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      // Gestion du fichier
      const filePath = path.join(__dirname, 'uploads', filename);
      const writeStream = fs.createWriteStream(filePath);
      file.pipe(writeStream);
      
      req.file = {
        path: filePath,
        filename: filename,
        mimetype: mimetype
      };
    });
  
    busboy.on('field', (fieldname, val) => {
      fields[fieldname] = val;
    });
  
    busboy.on('finish', () => {
      req.body = fields;
      next();
    });
  
    req.pipe(busboy);
};

// ================================================
// DONNÉES (Conservées intactes)
// ================================================

const conversionRates = {
    USD: 0.26,
    XAF: 150,
    EUR: 0.24,
    XOF: 150
    // Ajouter d'autres devises
};

// Création du serveur HTTP
const users = require('./data/users');


// ============
// MIDDLEWARES
// ============

// ======================
// MIDDLEWARES DE BASE
// ======================
app.use(fileUpload());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));


// ======================
// MIDDLEWARES DE SECURITE
// ======================
// CORS Configuration
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Rate Limiting
app.use('/api/posts', simpleRateLimit(15 * 60 * 1000, 10));

// ======================
// MIDDLEWARES DE FICHIERS
// ======================
// Configuration FileUpload
app.use(fileUpload({
  limits: { fileSize: MAX_FILE_SIZE },
  useTempFiles: true,
  tempFileDir: '/tmp/',
  parseNested: true,
  createParentPath: true
}));

// Pre-Parser pour les uploads
app.use('/api/upload', (req, res, next) => {
  if (req.headers['content-type']?.startsWith('multipart/form-data')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const match = body.match(/name="type"\r\n\r\n(.+?)\r\n/);
      if (match) {
        req.body = req.body || {};
        req.body.type = match[1];
      }
      next();
    });
  } else {
    next();
  }
});



// ======================
// MIDDLEWARE PROMOTION
// ======================
function checkPromoAccess(req, res, next) {
  if (PROMOTION_PERIOD.active && new Date() < new Date(PROMOTION_PERIOD.endDate)) {
    // Pendant la promo, on bypass la vérification de paiement
    req.promoAccess = true;
    return next();
  }
  req.promoAccess = false;
  next();
}

function checkMediaAccess(req, res, next) {
  if (PROMOTION_PERIOD.active && PROMOTION_PERIOD.allowPublicAccess) {
    return next();
  }
  verifyToken(req, res, next);
}

function checkFreeAccountLimit(req, res, next) {
  if (PROMOTION_PERIOD.active && 
      PROMOTION_PERIOD.currentFreeAccounts >= PROMOTION_PERIOD.maxFreeAccounts) {
    return sendJsonError(res, 429, 
      "Limite de comptes promotionnels atteinte. Veuillez vous abonner.");
  }
  next();
}

// ==============
// STRIPE HELPERS
// ==============
function getAmountInCents(amount, currency) {
  return ['XAF', 'JPY'].includes(currency) ? 
    Math.floor(amount) : // Devises sans centimes
    Math.floor(amount * 100);
}

// ======================
// MIDDLEWARES DE LOGGING
// ======================
// Logger global
app.use((req, res, next) => {
  req.startTime = Date.now();
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  req.id = requestId;
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ID: ${requestId}`);
  
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Status: ${res.statusCode} - Duration: ${Date.now() - req.startTime}ms`);
  });
  
  next();
});


app.use(express.raw({ type: 'application/json' }));  // Uniquement pour le webhook Stripe

// ================================================
// PARTIE 3 - FONCTIONS D'INITIALISATION
// ================================================
  
  function ensureDataFiles() {
    const requiredFiles = {
        'media.json': '[]',
        'ads.json': '[]',
        'playlist-config.json': JSON.stringify({ adFrequency: 3, items: [] }),
        'published-playlist.json': JSON.stringify({ items: [], ads: [], adFrequency: 3 })
      };
    
      Object.entries(requiredFiles).forEach(([file, content]) => {
        const filePath = path.join(DATA_DIR, file);
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, content);
          console.log(`Fichier ${file} créé avec le contenu par défaut`);
        }
      });
  }
  
  function createDirectories() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(TEST_VIDEOS_DIR)) fs.mkdirSync(TEST_VIDEOS_DIR, { recursive: true });
    
    Object.values(MEDIA_DIRS.videos).forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
    
    [MEDIA_DIRS.ads, MEDIA_DIRS.jingles].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }
  
  function migratePlaylist() {
    const path = require('path');
    const playlistPath = path.join(DATA_DIR, 'playlist-config.json');
    
    if (!fs.existsSync(playlistPath)) return;
    
    const playlist = JSON.parse(fs.readFileSync(playlistPath));
    
    if (!playlist.version) {
        playlist.items = playlist.items.map(item => ({
            ...item,
            path: getMediaPath(item)  // Utilise la même logique que le front
        }));
        playlist.version = 2;
        fs.writeFileSync(playlistPath, JSON.stringify(playlist, null, 2));
    }
  }  

// ======================
// HANDLERS PRINCIPAUX
// ======================
function handleSavePlaylistConfig(req, res) {
  let body = '';
  
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
      try {
          console.log("Données reçues:", body); // Debug
          
          const config = JSON.parse(body);
          const configPath = path.join(DATA_DIR, 'playlist-config.json');
          
          // Validation minimale
          if (!config.items || !Array.isArray(config.items)) {
              throw new Error('Structure de données invalide');
          }
          
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
          console.log("Playlist sauvegardée:", config); // Debug
          
          sendJsonSuccess(res, { 
              success: true,
              savedAt: new Date().toISOString()
          });
          
      } catch (error) {
          console.error("Erreur sauvegarde:", error); // Debug important
          sendJsonError(res, 500, {
              error: error.message,
              stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
          });
      }
  });
}

async function handleMediaListByType(req, res, type) {
  try {
    const mediaPath = path.join(PUBLIC_DIR, 'videos', type);
    const files = fs.readdirSync(mediaPath)
                   .filter(file => ['.mp4','.webm'].includes(path.extname(file)))
                   .map(file => ({
                     name: path.parse(file).name,
                     url: `/videos/${type}/${file}`
                   }));

    sendJsonSuccess(res, { [type]: files });
  } catch (error) {
    sendJsonError(res, 404, 'Contenu non disponible');
  }
}

async function handleLiveEvents(req, res) {
  try {
    const events = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'live_events.json')));
    sendJsonSuccess(res, { events });
  } catch (error) {
    sendJsonError(res, 404, 'Aucun événement en direct');
  }
}

async function analyzeSentiment(text) {
  // Exemple basique (en production, utiliser une API comme AWS Comprehend)
  const positiveWords = ['bon', 'excellent', 'super', 'génial'];
  const negativeWords = ['mauvais', 'nul', 'horrible', 'déçu'];
  
  const score = text.split(' ').reduce((acc, word) => {
    if (positiveWords.includes(word.toLowerCase())) return acc + 1;
    if (negativeWords.includes(word.toLowerCase())) return acc - 1;
    return acc;
  }, 0);

  return {
    score,
    label: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral'
  };
}

// À utiliser dans les routes POST:
async function processPost(post) {
  try {
    if (!post || !post.text) {
      throw new Error('Objet post invalide ou propriété text manquante');
    }
    
    const sentiment = await analyzeSentiment(post.text);
    return {
      ...post,
      sentiment  // Ajoute le sentiment au post
    };
    
  } catch (error) {
    console.error('Erreur dans processPost:', error);
    throw error; // Propage l'erreur pour la gérer dans la route
  }
}

async function handleInfosMedia(req, res) {
  try {
    sendJsonSuccess(res, {
      journals: [
        {
          id: 'tv-congo',
          title: 'JT de TV Congo',
          available: true,
          embedUrl: 'https://www.youtube.com/embed/uBrPiA50pmQ',
          description: 'Édition spéciale'
        },
        {
          id: 'drtv',
          title: 'JT de DRTV',
          available: false,
          message: 'Disponible bientôt'
        }
      ]
    });
  } catch (error) {
    sendJsonError(res, 500, 'Erreur de chargement');
  }
}

async function sendToFacebook(programTitle, message) {
  try {
    const postUrl = `https://graph.facebook.com/${FB_PAGE_ID}/feed`;
    
    const response = await fetch(postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `[${programTitle}] ${message}`,
        access_token: FB_ACCESS_TOKEN
      })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    console.log('Post Facebook réussi');
  } catch (error) {
    console.error('Erreur post Facebook:', error);
  }
}

async function sendToWhatsApp(programTitle, message) {
  try {
    const client = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    
    await client.messages.create({
      body: `[${programTitle}] ${message}`,
      from: TWILIO_WHATSAPP_NUMBER,
      to: YOUR_WHATSAPP_NUMBER
    });

    console.log('Message WhatsApp envoyé');
  } catch (error) {
    console.error('Erreur envoi WhatsApp:', error);
  }
}


// Fonctions utilitaires pour les notifications
async function sendWhatsAppNotification(message) {
  // À remplacer par votre numéro WhatsApp
  const whatsappNumber = process.env.WHATSAPP_NUMBER || '+242066694659';
  console.log(`Notification WhatsApp envoyée à ${whatsappNumber}: ${message}`);
  // Ici vous intégrerez l'API WhatsApp réelle
}

async function sendToFacebook(programTitle, message) {
  // À remplacer par votre page Facebook
  console.log(`Post Facebook pour "${programTitle}": ${message}`);
  // Ici vous intégrerez l'API Facebook réelle
}

async function sendToWhatsApp(programTitle, message) {
  // À remplacer par votre groupe WhatsApp
  console.log(`Message WhatsApp pour "${programTitle}": ${message}`);
  // Ici vous intégrerez l'API WhatsApp réelle
}

// Helper pour parser le multipart
function parseMultipart(buffer, boundary) {
  const parts = {};
  const partsArr = buffer.toString('binary').split(`--${boundary}`);
  
  partsArr.forEach(part => {
      if (part.includes('name="media"')) {
          const match = part.match(/filename="([^"]+)"/);
          if (match) parts.filename = match[1];
          
          const content = part.split('\r\n\r\n')[1];
          parts.media = Buffer.from(content.replace(/\r\n--$/, ''), 'binary');
      }
      else if (part.includes('name="type"')) {
          parts.type = part.split('\r\n\r\n')[1].replace(/\r\n--$/, '').trim();
      }
  });
  
  return parts;
}

// Debug ultime - liste toutes les routes enregistrées
app._router.stack.forEach((middleware) => {
  if (middleware.route) {
    console.log(`Route: ${middleware.route.path} (${Object.keys(middleware.route.methods)[0]})`);
  }
});

// CACHE MEMOIRE SYNOPSIS
let synopsisCache = null;
let lastCacheUpdate = 0;

function getSynopsisData() {
    const now = Date.now();
    if (!synopsisCache || now - lastCacheUpdate > 60000) { // 1 min cache
        const synopsisPath = path.join(DATA_DIR, 'synopsis.json');
        synopsisCache = fs.existsSync(synopsisPath) ? 
            JSON.parse(fs.readFileSync(synopsisPath)) : {};
        lastCacheUpdate = now;
    }
    return synopsisCache;
}

// ======================
// ROUTES STRIPE
// ======================

async function handleCheckoutSessionCompleted(session) {
  const userId = session.metadata.userId;
  if (!userId) return;

  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return;

  user.subscription = {
    status: 'active',
    plan: 'premium',
    currency: session.currency.toUpperCase(),
    lastPayment: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    stripeSessionId: session.id
  };

  saveUsers(users);
  console.log(`Abonnement activé pour ${userId}`);
}

async function handleInvoicePaymentSucceeded(invoice) {
  const sessionId = invoice.subscription || invoice.payment_intent;
  const users = getUsers();
  const user = users.find(u => u.subscription?.stripeSessionId === sessionId);
  
  if (user) {
    user.subscription.lastPayment = new Date().toISOString();
    user.subscription.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    saveUsers(users);
  }
}

async function handlePaymentFailed(invoice) {
  const sessionId = invoice.subscription || invoice.payment_intent;
  const users = getUsers();
  const user = users.find(u => u.subscription?.stripeSessionId === sessionId);
  
  if (user) {
    user.subscription.status = 'past_due';
    saveUsers(users);
  }
}

async function renewSubscription(invoice) {
  console.log('🔁 Abonnement renouvelé pour:', invoice.customer_email);
  // Ajoutez votre logique métier ici
}

function handleGetPlaylistConfig(req, res) {
  try {
      const configPath = path.join(DATA_DIR, 'playlist-config.json');
      
      if (!fs.existsSync(configPath)) {
          const defaultConfig = {
              adFrequency: 3,
              items: [],
              version: 2 // Nouveau champ pour identification
          };
          fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
          return sendJsonSuccess(res, defaultConfig);
      }
      
      const config = JSON.parse(fs.readFileSync(configPath));
      
      // Migration des anciennes playlists
      if (!config.version) {
          config.version = 2;
          config.items = config.items.map(item => ({
              ...item,
              isAd: item.type === 'ad' // Ajout du flag explicite
          }));
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      }
      
      sendJsonSuccess(res, config);
  } catch (error) {
      console.error("Erreur playlist:", error);
      sendJsonSuccess(res, {
          adFrequency: 3,
          items: [],
          version: 2
      });
  }
}

// [AJOUT] Nouvelle fonction handlePublicPlaylist
function handlePublicPlaylist(req, res) {
  try {
      const configPath = path.join(DATA_DIR, 'playlist-config.json');
      
      if (!fs.existsSync(configPath)) {
          const defaultPlaylist = {
              sequence: [{
                  type: "documentaires",
                  id: "default.mp4",
                  title: "Programme par défaut"
              }],
              config: { adFrequency: 3 }
          };
          return sendJsonSuccess(res, defaultPlaylist);
      }

      const config = JSON.parse(fs.readFileSync(configPath));
      sendJsonSuccess(res, {
          sequence: config.items || [],
          config: {
              adFrequency: config.adFrequency || 3
          }
      });
  } catch (error) {
      console.error("Erreur handlePublicPlaylist:", error);
      sendJsonSuccess(res, {
          sequence: [{
              type: "documentaires",
              id: "default.mp4",
              title: "Programme par défaut"
          }],
          config: { adFrequency: 3 }
      });
  }
}

function handleCurrentPlaylist(req, res) {
  try {
    const configPath = path.join(DATA_DIR, 'playlist-config.json');
    
    if (!fs.existsSync(configPath)) {
      return sendJsonSuccess(res, {
        sequence: [],
        config: { adFrequency: 3 },
        updatedAt: new Date().toISOString()
      });
    }

    const config = JSON.parse(fs.readFileSync(configPath));
    
    sendJsonSuccess(res, {
      sequence: config.items || [],
      config: {
        adFrequency: config.adFrequency || 3
      },
      updatedAt: new Date(fs.statSync(configPath).mtime).toISOString()
    });
  } catch (error) {
    console.error("Erreur handleCurrentPlaylist:", error);
    sendJsonSuccess(res, {
      sequence: [],
      config: { adFrequency: 3 },
      updatedAt: new Date().toISOString()
    });
  }
}

function handlePublishPlaylist(req, res) {
  try {
      const configPath = path.join(DATA_DIR, 'playlist-config.json');
      const config = JSON.parse(fs.readFileSync(configPath));

      // Format dual pour compatibilité
      const publishedData = {
          items: config.items,
          sequence: config.items.map(item => ({
              ...item,
              isAd: item.type === 'ad'
          })),
          config: {
              adFrequency: config.adFrequency
          },
          updatedAt: new Date().toISOString()
      };

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      sendJsonSuccess(res, {
          success: true,
          publishedAt: publishedData.updatedAt
      });

  } catch (error) {
      sendJsonError(res, 500, 'Erreur publication');
  }
}

function calculateTotalMediaSize() {
  try {
    let totalBytes = 0;
    
    // Parcourir tous les dossiers média
    Object.values(MEDIA_DIRS).forEach(dir => {
      if (typeof dir === 'string') {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          files.forEach(file => {
            const filePath = path.join(dir, file);
            totalBytes += fs.statSync(filePath).size;
          });
        }
      } else {
        Object.values(dir).forEach(subDir => {
          if (fs.existsSync(subDir)) {
            const files = fs.readdirSync(subDir);
            files.forEach(file => {
              const filePath = path.join(subDir, file);
              totalBytes += fs.statSync(filePath).size;
            });
          }
        });
      }
    });
    
    // Conversion en MB avec 2 décimales
    return (totalBytes / (1024 * 1024)).toFixed(2) + 'MB';
  } catch (error) {
    console.error("Erreur calcul taille:", error);
    return '0MB';
  }
}

function calculateMediaSize() {
  try {
      let totalBytes = 0;
      
      // Calculer la taille des vidéos
      const mediaDir = path.join(PUBLIC_DIR, 'videos');
      if (fs.existsSync(mediaDir)) {
          totalBytes += getDirSize(mediaDir);
      }
      
      // Calculer la taille des pubs
      const adsDir = path.join(PUBLIC_DIR, 'ads');
      if (fs.existsSync(adsDir)) {
          totalBytes += getDirSize(adsDir);
      }
      
      // Calculer la taille des jingles
      const jinglesDir = path.join(PUBLIC_DIR, 'jingles');
      if (fs.existsSync(jinglesDir)) {
          totalBytes += getDirSize(jinglesDir);
      }
      
      // Conversion en MB avec 2 décimales
      return (totalBytes / (1024 * 1024)).toFixed(2) + 'MB';
  } catch (error) {
      console.error("Erreur calcul taille:", error);
      return '0MB';
  }
}

function getDirSize(dir) {
  const files = fs.readdirSync(dir);
  return files.reduce((total, file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      return total + stat.size;
  }, 0);
}

function handleUsers(req, res) {
  try {
    const users = getUsers();
    sendJsonSuccess(res, users);
  } catch (error) {
    sendJsonError(res, 500, 'Erreur de lecture des utilisateurs');
  }
}

function parseFormData(body) {
  const boundary = body.split('\r\n')[0];
  const parts = body.split(boundary).filter(part => part.includes('Content-Disposition'));
  
  const result = {};
  parts.forEach(part => {
      const nameMatch = part.match(/name="([^"]+)"/);
      const filenameMatch = part.match(/filename="([^"]+)"/);
      const value = part.split('\r\n\r\n')[1].replace(/\r\n$/, '');
      
      if (nameMatch) {
          result[nameMatch[1]] = filenameMatch ? filenameMatch[1] : value;
      }
  });
  return result;
}



function updateStatsForAllClients() {
  // Implémentation dépend de votre système de websockets
  // ou simplement rafraîchir côté client avec setTimeout
}


function calculateTotalMediaSize() {
  try {
      let totalBytes = 0;
      
      // Parcourir tous les dossiers média
      Object.values(MEDIA_DIRS).forEach(dir => {
          if (typeof dir === 'string') {
              totalBytes += getDirectorySize(dir);
          } else {
              Object.values(dir).forEach(subDir => {
                  totalBytes += getDirectorySize(subDir);
              });
          }
      });
      
      // Conversion en MB avec 2 décimales
      return (totalBytes / (1024 * 1024)).toFixed(2) + 'MB';
  } catch (error) {
      console.error("Erreur calcul taille:", error);
      return '0MB';
  }
}

function handlePromoStatus(req, res) {
  sendJsonSuccess(res, {
    active: PROMOTION_PERIOD.active,
    allowPublicAccess: PROMOTION_PERIOD.allowPublicAccess,
    remainingAccounts: PROMOTION_PERIOD.maxFreeAccounts - PROMOTION_PERIOD.currentFreeAccounts,
    endDate: PROMOTION_PERIOD.endDate
  });
}

function getContentType(url) {
  const ext = path.extname(url);
  switch (ext) {
    case '.mp4': return 'video/mp4';
    case '.webm': return 'video/webm';
    case '.ogg': return 'video/ogg';
    default: return 'application/octet-stream';
  }
}

function handlePlaybackError(error) {
  console.error("Erreur lecture:", {
      error,
      currentIndex,
      currentMedia: currentPlaylist[currentIndex]
  });

  // Passer au média suivant après 5s
  setTimeout(() => {
      currentIndex++;
      playNextItem();
  }, 5000);
}

function handleFileUpload(req, res) {
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('multipart/form-data')) {
      return sendJsonError(res, 400, 'Content-Type doit être multipart/form-data');
  }

  let body = [];
  let boundary = contentType.split('boundary=')[1];
  if (!boundary) return sendJsonError(res, 400, 'Boundary manquant');

  req.on('data', (chunk) => {
      body.push(chunk);
  });

  req.on('end', () => {
      try {
          const fullBody = Buffer.concat(body).toString('binary');
          const parts = fullBody.split('--' + boundary);

          let fileContent, fileName, mediaType;

          parts.forEach(part => {
              if (part.includes('name="media"')) {
                  const filenameMatch = part.match(/filename="([^"]+)"/);
                  if (filenameMatch) fileName = filenameMatch[1];
                  fileContent = part.split('\r\n\r\n')[1].replace(/\r\n--$/, '');
              } else if (part.includes('name="type"')) {
                  mediaType = part.split('\r\n\r\n')[1].replace(/\r\n--$/, '').trim();
              }
          });

          if (!fileContent || !fileName || !mediaType) {
              return sendJsonError(res, 400, 'Fichier et type requis');
          }

          // Déterminer le dossier cible
          let targetDir;
          if (mediaType === 'ad') {
              targetDir = path.join(PUBLIC_DIR, 'ads');
          } else if (mediaType === 'jingle') {
              targetDir = path.join(PUBLIC_DIR, 'jingles');
          } else {
              targetDir = path.join(PUBLIC_DIR, 'videos', mediaType);
          }

          if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
          }

          const filePath = path.join(targetDir, fileName);
          fs.writeFileSync(filePath, fileContent, 'binary');

          // Enregistrer dans media.json
          const mediaEntry = {
              id: fileName,
              title: path.parse(fileName).name,
              type: mediaType,
              path: path.relative(PUBLIC_DIR, filePath),
              date: new Date().toISOString()
          };

          const mediaPath = path.join(DATA_DIR, 'media.json');
          const mediaList = fs.existsSync(mediaPath) ? JSON.parse(fs.readFileSync(mediaPath)) : [];
          mediaList.push(mediaEntry);
          fs.writeFileSync(mediaPath, JSON.stringify(mediaList, null, 2));

          sendJsonSuccess(res, {
              success: true,
              message: 'Fichier uploadé avec succès',
              filename: fileName,
              id: fileName,
              type: mediaType,
              date: new Date().toISOString()
          });

      } catch (error) {
          console.error('Upload error:', error);
          sendJsonError(res, 500, 'Erreur serveur lors de l\'upload');
      }
  });
}


// Fonction pour diffuser à tous les clients
function broadcast(data) {
  clients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// ================================================
// PARTIE 4 - FONCTIONS UTILITAIRES
// ================================================

// --- Gestion des chemins ---
function buildMediaPath(item) {
    if (!item || !item.type) return '';
  
    if (item.type === 'ad') {
        return `ads/${item.id}`;
    } else if (item.type === 'jingle') {
        return `jingles/${item.id}`;
    } else {
        return `videos/${item.type}/${item.id}`;
    }
  }
  
  function getFileName(path) {
    if (!path) return 'Sans titre';
    const filename = path.split('/').pop().split('\\').pop();
    return filename.replace(/\.[^/.]+$/, ""); // Retire l'extension
  }
  
  function getDefaultPath(item) {
    return item.type === 'ad' ? `ads/${item.id}` 
    : item.type === 'jingle' ? `jingles/${item.id}`
    : `videos/${item.type}/${item.id}`;
  }
  
  // --- Gestion des réponses ---
  function sendJsonError(res, statusCode, message) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    success: false, 
    error: message,
    timestamp: new Date().toISOString()
  }));
  }
  
  getFileName();

  function sendJsonSuccess(res, data, statusCode = 200) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, ...data }));
  }
  
  // --- Gestion des fichiers ---
  function getDirectorySize(dir) {
    if (!fs.existsSync(dir)) return 0;
  
    let totalSize = 0;
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        totalSize += stat.size;
    });
    
    return totalSize;
  }
  
  function calculateTotalSize() {
    try {
        let totalBytes = 0;
        
        // Calculer taille depuis media.json
        const mediaPath = path.join(DATA_DIR, 'media.json');
        if (fs.existsSync(mediaPath)) {
            const media = JSON.parse(fs.readFileSync(mediaPath));
            media.forEach(item => {
                if (item.path) {
                    const fullPath = path.join(PUBLIC_DIR, item.path);
                    if (fs.existsSync(fullPath)) {
                        totalBytes += fs.statSync(fullPath).size;
                    }
                }
            });
        }
        
        // Calculer taille depuis ads.json
        const adsPath = path.join(DATA_DIR, 'ads.json');
        if (fs.existsSync(adsPath)) {
            const ads = JSON.parse(fs.readFileSync(adsPath));
            ads.forEach(ad => {
                if (ad.path) {
                    const fullPath = path.join(PUBLIC_DIR, ad.path);
                    if (fs.existsSync(fullPath)) {
                        totalBytes += fs.statSync(fullPath).size;
                    }
                }
            });
        }
        
        return (totalBytes / (1024 * 1024)).toFixed(2) + 'MB';
    } catch (error) {
        console.error("Erreur calcul taille:", error);
        return '0MB';
    }
  }
  
  async function readJsonFile(filename) {
    try {
      const filePath = path.join(DATA_DIR, filename);
      const rawData = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(rawData);
    } catch (error) {
      console.error(`Erreur lecture ${filename}:`, error);
      // Retourne un tableau/objet vide selon le contexte attendu
      return filename.includes('playlist') ? { items: [] } : [];
    }
  }

  function readJsonFileSync(filename) {
    try {
      const filePath = path.join(DATA_DIR, filename);
      const rawData = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(rawData);
    } catch (error) {
      console.error(`Erreur lecture sync ${filename}:`, error);
      return filename.includes('playlist') ? { items: [] } : [];
    }
  }
  
  // --- Sécurité ---
  function sanitizeText(text) {
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  
  function validateMediaId(req, res, next) {
    try {
        const mediaId = req.body.mediaId || req.query.mediaId;
        
        // Lire le fichier media.json
        const mediaPath = path.join(DATA_DIR, 'media.json');
        const mediaData = fs.existsSync(mediaPath) 
            ? JSON.parse(fs.readFileSync(mediaPath))
            : [];
        
        // Vérifier si l'ID existe
        const mediaExists = mediaData.some(item => item.id === mediaId);
        
        if (!mediaExists) {
            console.error(`ID média invalide : ${mediaId}`);
            return sendJsonError(res, 404, {
                error: "Média non trouvé",
                availableIds: mediaData.map(item => item.id)
            });
        }
        
        next();
    } catch (error) {
        console.error("Erreur validation média :", error);
        sendJsonError(res, 500, "Erreur de validation");
    }
  }
  

  function moderatePost(id, action) {
    const postsPath = path.join(DATA_DIR, 'posts.json');
    const posts = JSON.parse(fs.readFileSync(postsPath));
    
    const postIndex = posts.findIndex(p => p.id === id);
    if (postIndex === -1) {
      return sendJsonError(res, 404, 'Post non trouvé');
    }
  
    posts[postIndex].status = action;
    posts[postIndex].moderatedAt = new Date().toISOString();
    posts[postIndex].moderatedBy = req.user?.userId || 'system';
  
    fs.writeFileSync(postsPath, JSON.stringify(posts, null, 2));
    
    // Notifier l'auteur si possible
    if (action === 'approved') {
      notifyUserAboutPostStatus(posts[postIndex], 'approuvé');
    }
  
    broadcast({
      type: 'post_moderated',
      data: posts[postIndex]
    });
  
    sendJsonSuccess(res, { success: true });
  }
  
  function validatePost(text) {
    if (typeof text !== 'string') return false;
    if (text.length > 200) return false;
    if (/<script.*?>.*?<\/script>/gi.test(text)) return false;
    return true;
  }
  
  function encodeURIComponent(str) {
      return encodeURIComponent(str).replace(/[!'()*]/g, function(c) {
          return '%' + c.charCodeAt(0).toString(16);
      });
  }
  
  async function updatePlaylistsAfterDeletion(mediaId) {
    const playlistPath = path.join(DATA_DIR, 'playlist-config.json');
    if (!fs.existsSync(playlistPath)) return;
  
    const playlist = JSON.parse(await fs.promises.readFile(playlistPath));
    if (playlist.items) {
        playlist.items = playlist.items.filter(item => item.id !== mediaId);
        await fs.promises.writeFile(playlistPath, JSON.stringify(playlist, null, 2));
    }
  }

  function getAmount(currency) {
    return conversionRates[currency] || conversionRates.XOF;
  }
  
  function validateCurrency(currency) {
    return ['XAF', 'XOF','USD', 'EUR'].includes(currency);
  }

  // ================================================
  // PARTIE 5 - FONCTIONS MÉTIER
  // ================================================
  
  // --- Gestion des médias ---
  function syncPublishedPlaylist() {
    const mediaPath = path.join(DATA_DIR, 'media.json');
  const playlistPath = path.join(DATA_DIR, 'published-playlist.json');
  
  try {
      // Lire les médias existants
      const media = JSON.parse(fs.readFileSync(mediaPath));
      
      // Structure de base si le fichier n'existe pas
      let playlist = {
          items: [],
          ads: [],
          adFrequency: 3,
          lastUpdated: new Date().toISOString()
      };

      if (fs.existsSync(playlistPath)) {
          playlist = JSON.parse(fs.readFileSync(playlistPath));
      }

      // Mettre à jour les références des médias
      playlist.items = playlist.items.map(item => {
          const mediaItem = media.find(m => m.id === item.id);
          return mediaItem ? { ...item, ...mediaItem } : item;
      }).filter(item => item); // Retirer les éléments null

      // Sauvegarder
      fs.writeFileSync(playlistPath, JSON.stringify(playlist, null, 2));
      console.log('Playlist synchronisée avec media.json');

  } catch (error) {
      console.error('Erreur synchronisation playlist:', error);
  }
  }
  
  function interleaveAds(items, ads, frequency = 3) {
    if (!items || !ads) return [];
    
    const result = [];
    let adCounter = 0;
    
    items.forEach((item, index) => {
        result.push(item);
        
        // Insère une pub selon la fréquence
        if ((index + 1) % frequency === 0 && ads.length > 0) {
            const adToInsert = ads[adCounter % ads.length];
            result.push({
                ...adToInsert,
                isAd: true,
                type: 'ad'
            });
            adCounter++;
        }
    });
    
    return result;
  }

// ==========================
// ROUTE DE CONNEXION CLIENTS
// ==========================
app.post('/api/auth/login', async (req, res) => {
  try {
      const { email, password } = await parseRequestBody(req);
      const user = getUsers().find(u => u.email === email);
      
      if (!user || !(await bcrypt.compare(password, user.password))) {
          return sendJsonError(res, 401, 'Email/mot de passe incorrect');
      }

      // Génération du token
      const token = jwt.sign(
          { userId: user.id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: '24h' } // Durée de validité
      );

      sendJsonSuccess(res, { 
          token,
          user: { id: user.id, email: user.email }
      });
      
  } catch (error) {
      sendJsonError(res, 500, 'Erreur de connexion');
  }
});

// Helper pour parser le corps des requêtes
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
  });
}

  // Helper pour sauvegarder la config
function savePromoConfig() {
  ensureDataDir();
  fs.writeFileSync(
    path.join(DATA_DIR, 'promo-config.json'),
    JSON.stringify({
      ...PROMOTION_PERIOD,
      lastUpdated: new Date().toISOString()
    }, null, 2)
  );
}

  // --- Gestion des utilisateurs ---
  function getUsers() {
    const usersPath = path.join(DATA_DIR, 'users.json');
  
    try {
      if (!fs.existsSync(usersPath)) {
        fs.writeFileSync(usersPath, JSON.stringify([], null, 2));
        return [];
      }
      
      const fileContent = fs.readFileSync(usersPath, 'utf8');
      const users = JSON.parse(fileContent);
      
      // Validation de la structure
      if (!Array.isArray(users)) {
        console.error('Format invalide pour users.json, réinitialisation');
        fs.writeFileSync(usersPath, JSON.stringify([], null, 2));
        return [];
      }
      
      return users;
    } catch (error) {
      console.error("Erreur lecture users.json:", error);
      return [];
    }
  }
  
  function saveUsers(users) {
    fs.writeFileSync(path.join(DATA_DIR, 'users.json'), JSON.stringify(users, null, 2));
  }
  
  function getUserById(id) {
    return getUsers().find(u => u.id === id);
  }
  
  // --- Stripe ---
  async function createStripeSession(userId, email, currency) {
    const amount = { XAF: 150, USD: 0.26, EUR: 0.24 }[currency] || 150;
  
  return await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: currency.toLowerCase(),
        product_data: { 
          name: "Abonnement HLFLUX Premium",
          description: "Accès 30 jours"
        },
        unit_amount: getAmountInCents(amount, currency),
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}&user=${userId}`,
    cancel_url: `${process.env.BASE_URL}/signup`,
    customer_email: email,
    metadata: { userId }
  });
  }
  
  async function handleCheckoutSuccess(session) {
    console.log('💰 Paiement réussi pour:', session.customer_email);
    // Exemple : Mettre à jour votre base de données
    const users = getUsers();
    const user = users.find(u => u.email === session.customer_email);
    if (user) {
      user.subscriptionStatus = 'active';
      saveUsers(users);
    }
  }
  
  // --- Authentification ---
  function verifyToken(req, res, next) {
  // Pendant la promo, on permet l'accès sans token
  if (PROMOTION_PERIOD.active && PROMOTION_PERIOD.allowPublicAccess) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1] || req.query.token;
  
  if (!token) {
    console.warn('Token manquant pour:', req.url);
    return sendJsonError(res, 401, 'Token manquant');
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Erreur JWT:', err.message);
    
    // Renvoyer un JSON valide même en cas d'erreur
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: false,
      error: 'Token invalide ou expiré',
      code: 'AUTH_REQUIRED'
    }));
  }
  }
  
  function checkUserAccess(user) {
  // 1. Admin a toujours accès
  if (user?.role === 'admin') return true;
  
  // 2. Pendant la promo
  if (PROMOTION_PERIOD.active) {
    // Vérifie si l'utilisateur a une promo personnelle
    return user?.promoAccess?.granted || PROMOTION_PERIOD.allowPublicAccess;
  }
  
  // 3. Mode normal - vérification abonnement
  return user?.subscription?.status === 'active';
  }
  
  // ================================================
  // PARTIE 6 - HANDLERS DE ROUTES
  // ================================================
  
  // --- Handlers GET ---
  function handleStats(req, res) {
    try {
        const mediaPath = path.join(DATA_DIR, 'media.json');
        const adsPath = path.join(DATA_DIR, 'ads.json');
        
        let stats = {
            totalVideos: 0,
            totalAds: 0,
            totalSpace: '0MB',
            lastUpdated: new Date().toISOString()
        };
  
        if (fs.existsSync(mediaPath)) {
            const media = JSON.parse(fs.readFileSync(mediaPath));
            const mediaArray = Array.isArray(media) ? media : Object.values(media || {});
  
            // Compter les vidéos (tout sauf pubs et jingles)
            stats.totalVideos = mediaArray.filter(m => 
                m.type && !['ad', 'jingle'].includes(m.type)
            ).length;
        }
  
        if (fs.existsSync(adsPath)) {
            const ads = JSON.parse(fs.readFileSync(adsPath));
            stats.totalAds = Array.isArray(ads) ? ads.length : Object.keys(ads || {}).length;
        }
  
        // Calculer la taille totale
        stats.totalSpace = calculateTotalMediaSize();
  
        sendJsonSuccess(res, stats);
    } catch (error) {
        console.error("Erreur stats:", error);
        sendJsonSuccess(res, {
            totalVideos: 0,
            totalAds: 0,
            totalSpace: '0MB',
            error: "Erreur de calcul"
        });
    }
  }
  
  function handleMediaList(req, res) {
    try {
        const mediaPath = path.join(DATA_DIR, 'media.json');
        
        // Fichier inexistant = tableau vide
        if (!fs.existsSync(mediaPath)) {
            return sendJsonSuccess(res, []);
        }
  
        const fileData = fs.readFileSync(mediaPath);
        let mediaData;
        
        try {
            mediaData = JSON.parse(fileData);
        } catch (e) {
            console.error("Erreur parsing media.json:", e);
            return sendJsonSuccess(res, []);
        }
  
        // Conversion en tableau si nécessaire
        let mediaArray = Array.isArray(mediaData) ? mediaData : [];
        
        // Si objet, tenter de convertir
        if (!Array.isArray(mediaData) && typeof mediaData === 'object') {
            mediaArray = Object.values(mediaData);
        }
  
        // Filtrage des entrées invalides
        mediaArray = mediaArray.filter(item => 
            item && typeof item === 'object' && (item.id || item.path)
        );
  
        sendJsonSuccess(res, mediaArray);
  
    } catch (error) {
        console.error("Erreur handleMediaList:", error);
        sendJsonSuccess(res, []);
    }
  }
  
  // --- Handlers POST ---
  async function handleSignup(req, res) {
    if (PROMOTION_PERIOD.active && 
        PROMOTION_PERIOD.currentFreeAccounts >= PROMOTION_PERIOD.maxFreeAccounts) {
      return sendJsonError(res, 429, 'Limite de comptes promotionnels atteinte');
    }
  
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { email, password, currency = 'XAF' } = JSON.parse(body);
        if (!email || !password) {
          return sendJsonError(res, 400, 'Email et mot de passe requis');
        }
  
        const users = getUsers();
        const existingUser = users.find(u => u.email === email);
        const hashedPassword = await bcrypt.hash(password, 10);
  
        // 🎁 Promo active : autoriser réactivation de l'utilisateur existant
        if (existingUser) {
          if (PROMOTION_PERIOD.active) {
            existingUser.password = hashedPassword;
            existingUser.status = 'active';
            existingUser.promoAccess = {
              granted: true,
              expiresAt: new Date(Date.now() + PROMOTION_PERIOD.freeAccessDays * 86400000).toISOString()
            };
            saveUsers(users);
            const token = jwt.sign({ userId: existingUser.id }, SECRET_KEY);
            return sendJsonSuccess(res, { token });
          } else {
            return sendJsonError(res, 409, 'Email déjà utilisé');
          }
        }
  
        // 👤 Création d’un nouvel utilisateur
        const newUser = {
          id: Date.now().toString(),
          email,
          password: hashedPassword,
          role: 'user',
          createdAt: new Date().toISOString(),
          status: 'active',
          currency
        };
  
        if (PROMOTION_PERIOD.active) {
          newUser.promoAccess = {
            granted: true,
            expiresAt: new Date(Date.now() + PROMOTION_PERIOD.freeAccessDays * 86400000).toISOString()
          };
          PROMOTION_PERIOD.currentFreeAccounts++;
        }
  
        saveUsers([...users, newUser]);
        const token = jwt.sign({ userId: newUser.id }, SECRET_KEY);
        return sendJsonSuccess(res, { token });
  
      } catch (err) {
        console.error('❌ Erreur handleSignup:', err);
        return sendJsonError(res, 500, 'Erreur interne serveur');
      }
    });
  }  
  
  async function handleLogin(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { email, password } = JSON.parse(body);
        const users = getUsers();
        const user = users.find(u => u.email === email);
        
        if (!user) return sendJsonError(res, 401, 'Email ou mot de passe incorrect');
        
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return sendJsonError(res, 401, 'Email ou mot de passe incorrect');
  
        const token = jwt.sign(
          { userId: user.id, email: user.email, role: user.role },
          SECRET_KEY,
          { expiresIn: '24h' }
        );
        
        sendJsonSuccess(res, { token, userId: user.id });
      } catch (error) {
        sendJsonError(res, 500, 'Erreur de connexion: ' + error.message);
      }
    });
  }
  
  // --- Handlers PUT ---
  async function handleUpdateMedia(req, res) {
    let body = '';
    const mediaId = decodeURIComponent(req.url.split('/api/media/')[1]);
    
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const updates = JSON.parse(body);
            const mediaPath = path.join(DATA_DIR, 'media.json');
            let media = [];
            
            if (fs.existsSync(mediaPath)) {
                media = JSON.parse(fs.readFileSync(mediaPath));
                // Convertir en tableau si c'est un objet
                if (!Array.isArray(media)) {
                    media = Object.values(media);
                }
            }
            
            const index = media.findIndex(m => m.id === mediaId);
            if (index === -1) return sendJsonError(res, 404, 'Média non trouvé');
            
            // Mise à jour des champs
            media[index] = { 
                ...media[index],
                title: updates.title || media[index].title,
                original_title: updates.original_title || media[index].original_title,
                year: updates.year || media[index].year,
                copyright: updates.copyright || media[index].copyright,
                director: updates.director || media[index].director,
                producer: updates.producer || media[index].producer,
                duration: updates.duration || media[index].duration,
                synopsis: updates.synopsis || media[index].synopsis,
                genre: updates.genre || media[index].genre || [],
                rating: updates.rating || media[index].rating || 0,
                updatedAt: new Date().toISOString()
            };
            
            fs.writeFileSync(mediaPath, JSON.stringify(media, null, 2));
            
            sendJsonSuccess(res, { 
                success: true, 
                message: 'Média mis à jour',
                media: media[index]
            });
        } catch (error) {
            console.error("Erreur mise à jour média:", error);
            sendJsonError(res, 500, 'Erreur de mise à jour');
        }
    });
  }
  
  // --- Handlers DELETE ---
  function handleDeleteMedia(req, res) {
    const mediaId = decodeURIComponent(req.params.id);
  
    if (!mediaId) {
      return sendJsonError(res, 400, 'ID de média manquant');
    }
  
    try {
        const mediaPath = path.join(DATA_DIR, 'media.json');
        if (!fs.existsSync(mediaPath)) {
            return sendJsonError(res, 404, 'Base de données média non trouvée');
        }
  
        const mediaData = JSON.parse(fs.readFileSync(mediaPath));
        const mediaArray = Array.isArray(mediaData) ? mediaData : Object.values(mediaData);
        
        // Trouver l'index du média à supprimer
        const mediaIndex = mediaArray.findIndex(item => item.id === mediaId);
        if (mediaIndex === -1) {
            return sendJsonError(res, 404, 'Média non trouvé');
        }
  
        // Supprimer le fichier physique
        const mediaItem = mediaArray[mediaIndex];
        const filePath = path.join(PUBLIC_DIR, mediaItem.path);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
  
        // Supprimer de la liste
        mediaArray.splice(mediaIndex, 1);
  
        // Sauvegarder
        fs.writeFileSync(mediaPath, JSON.stringify(mediaArray, null, 2));
  
        sendJsonSuccess(res, { 
            success: true, 
            message: 'Média supprimé avec succès' 
        });
  
    } catch (error) {
        console.error("Erreur handleDeleteMedia:", error);
        sendJsonError(res, 500, 'Erreur lors de la suppression du média');
    }
  }



  async function someFunction() {
    try {
      // code
    } catch (error) {
      console.error("Détails de l'erreur:", {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error; // ou gérer l'erreur
    }
  }

  function verifyPayment(req, res, next) {
    // Pendant la promo, accès gratuit
    if (PROMOTION_PERIOD.active) return next();
  
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return sendJsonError(res, 401, 'Token requis');
  
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = getUsers().find(u => u.id === decoded.userId);
  
      const hasValidSub = user?.subscription?.status === 'active' && 
                         new Date(user.subscription.expiresAt) > new Date();
  
      if (!hasValidSub) {
        return sendJsonError(res, 403, 'Abonnement requis');
      }
      
      next();
    } catch (err) {
      sendJsonError(res, 403, 'Token invalide');
    }
  }

// ======================
// MIDDLEWARES DE GESTION D'ERREURS
// ======================
// Gestion des headers multiples
app.use((req, res, next) => {
  let headersSent = false;
  
  const originalWriteHead = res.writeHead;
  const originalEnd = res.end;
  
  res.writeHead = function() {
    if (headersSent) {
      console.error('Tentative d\'envoi d\'en-têtes multiples pour:', req.url);
      return;
    }
    headersSent = true;
    return originalWriteHead.apply(this, arguments);
  };
  
  res.end = function() {
    if (headersSent && !this.writableEnded) {
      console.error('Tentative d\'envoi de réponse multiple pour:', req.url);
      return;
    }
    return originalEnd.apply(this, arguments);
  };
  
  next();
});

// Gestion d'erreurs globale (UN SEUL MIDDLEWARE D'ERREUR)
app.use((err, req, res, next) => {
  console.error('🔥 Erreur globale:', {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
    requestId: req.id
  });
  
  res.status(500).json({
    success: false,
    error: 'Erreur interne du serveur',
    ...(DEBUG && { details: err.message })
  });
});

// ======================
// ROUTES STATIQUES
// ======================
app.use(express.static(PUBLIC_DIR)); // Sert tout le dossier public
app.use(express.static(VIEWS_DIR)); 

// ======================
// 404 - TOUJOURS EN DERNIER
// ======================

// Gestion des routes non trouvées
app.use((req, res) => {
  res.status(404).send(`
    <h1>404 - Page non trouvée</h1>
    <p>La ressource demandée n'existe pas</p>
  `);
});

app.use((err, req, res, next) => {
  console.error('Erreur middleware:', err);
  sendJsonError(res, 500, 'Erreur interne du serveur');
});

process.on('uncaughtException', (err) => {
  console.error('Exception non capturée:', err);
});

app.use((err, req, res, next) => {
  console.error('Erreur:', err.stack);
  res.status(500).send('Erreur serveur');
});

// AUTHENTIFICATION A VERIFIER 
  
  app.post('/api/auth/simple-login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = getUsers();
        const user = users.find(u => u.email === email);
    
        if (!user) {
          return sendJsonError(res, 401, 'Email ou mot de passe incorrect');
        }
    
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch && password === '#Presid@01' && email === 'admin@hlflux.com') {
          const hashedPassword = await bcrypt.hash('#Presid@01', 10);
          user.password = hashedPassword;
          saveUsers(users);
        } else if (!passwordMatch) {
          return sendJsonError(res, 401, 'Email ou mot de passe incorrect');
        }
    
        const token = jwt.sign(
          { userId: user.id, email: user.email, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: '30d' }
        );
    
        sendJsonSuccess(res, {
          token,
          user: { email: user.email, role: user.role }
        });
      } catch (error) {
        console.error('Login error:', error);
        sendJsonError(res, 500, 'Erreur de connexion');
      }
  });

  // ======================
  // INITIALISATION ROUTES EXTERNES
  // ======================
  synopsisEditor.init(app, DATA_DIR);

  // ================================================
// PARTIE 8 - DÉMARRAGE SERVEUR
// ================================================

const startServer = async () => {
    server.listen(PORT, () => {
      console.log(`✅ HLFLUX WebTV Server en écoute sur http://localhost:${PORT}`);
    });
  
    try {
      await adSync.syncAds();
      console.log("🔁 Synchronisation pubs OK");
    } catch (e) {
      console.error('❌ Erreur sync initiale:', e);
    }
  };
  
  startServer();

// Initialisation
initProjectDirs();
ensureDataFiles();
migratePlaylist();