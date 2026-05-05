const express = require('express');
const app = express();
const router = express.Router();

function requireAuth(request, response, next) { next(); }

app.get('/health', (request, response) => response.json({ ok: true }));
router.post('/users', requireAuth, (request, response) => response.status(201).json({}));

module.exports = app;
