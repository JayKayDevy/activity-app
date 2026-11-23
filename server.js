const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3300;

const WORDS = {
  pantomime: [
    "Zähne putzen", "Staubsaugen", "Eis essen", "Skifahren", "Angeln", "Boxen",
    "Yoga machen", "Klavier spielen", "Gitarre spielen", "Seil springen", "Tauchen",
    "Golf spielen", "Fallschirmspringen", "Reiten", "Rudern", "Zelt aufbauen",
    "Schneemann bauen", "Fenster putzen", "Rasen mähen", "Wäsche aufhängen",
    "Pizza backen", "Kaffee kochen", "Auto waschen", "Haare föhnen",
    "Make-up auftragen", "Krawatte binden", "Regenschirm aufspannen",
    "Flugzeug fliegen", "Dirigent sein", "Feuerwehrmann", "Clown", "Zauberer",
    "Boxer", "Balletttänzer", "Seiltänzer", "Astronaut", "Taucher", "Kellner",
    "Friseur", "Koch", "Gärtner", "Maler", "Roboter", "Affe", "Pinguin",
    "Känguru", "Flamingo", "Elefant", "Schlange", "Frosch", "Ente", "Löwe",
    "Bär beim Honig essen", "Hund, der bellt", "Katze, die sich putzt",
    "Vogel, der fliegt", "Baby, das krabbelt", "Oma, die strickt",
    "Jemand, der niest", "Jemand, der friert", "Gewichte heben",
    "Treppen steigen", "Auto einparken", "Wäsche bügeln", "Zelt abbauen",
    "Schlittschuhlaufen", "Trampolin springen", "Kuchen backen", "Wand streichen",
  ],
  zeichnen: [
    "Regenbogen", "Pizza", "Roboter", "Vulkan", "Geburtstagskuchen", "Dinosaurier",
    "U-Boot", "Weihnachtsbaum", "Schneemann", "Rakete", "Leuchtturm", "Drache",
    "Kamera", "Fahrrad", "Zug", "Flugzeug", "Burg", "Schatzkarte", "Pirat",
    "Vampir", "Zombie", "Gespenst", "Sonnenbrille", "Krone", "Diamant",
    "Schatztruhe", "Glühbirne", "Regenschirm", "Kaktus", "Palme", "Fußball",
    "Basketballkorb", "Gitarre", "Trompete", "Mikrofon", "Kopfhörer",
    "Smartphone", "Laptop", "Roboterhund", "Ufo", "Außerirdischer", "Sanduhr",
    "Kompass", "Weltkarte", "Globus", "Brücke", "Windmühle", "Vogelhäuschen",
    "Schneeflocke", "Blitz", "Regenwolke", "Sonnenblume", "Marienkäfer",
    "Schmetterling", "Qualle", "Hai", "Delfin", "Oktopus", "Seepferdchen",
    "Berggipfel", "Lagerfeuer", "Iglu", "Karussell",
  ],
  erklaeren: [
    "Freiheit", "Nostalgie", "Künstliche Intelligenz", "Teamgeist", "Homeoffice",
    "Deadline", "Meeting", "Kaffeepause", "Urlaubsantrag", "Brainstorming",
    "Feedback", "Motivation", "Kreativität", "Geduld", "Vertrauen", "Humor",
    "Pünktlichkeit", "Überraschung", "Tradition", "Freundschaft", "Erfolg",
    "Scheitern", "Mut", "Neugier", "Gewohnheit", "Chaos", "Ordnung", "Zufall",
    "Intuition", "Inspiration", "Work-Life-Balance", "Multitasking", "Cloud",
    "Software-Update", "Bug", "Feature", "Release", "Server", "Datenbank",
    "Algorithmus", "Passwort", "Firewall", "Backup", "Debugging",
    "Daily Standup", "Sprint", "Kanban-Board", "Retrospektive", "Onboarding",
    "Networking-Event", "Geburtstag", "Jubiläum", "Weihnachtsfeier",
    "Sommerurlaub", "Wochenende", "Frühstück", "Mittagspause", "Großraumbüro",
    "Dienstreise", "Firmenhandy",
  ],
};

const CATEGORY_LABELS = {
  pantomime: "Pantomime",
  zeichnen: "Zeichnen",
  erklaeren: "Erklären",
};
const CATEGORY_ORDER = ["pantomime", "zeichnen", "erklaeren"];

const rooms = {};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeDecks() {
  return {
    pantomime: shuffle(WORDS.pantomime),
    zeichnen: shuffle(WORDS.zeichnen),
    erklaeren: shuffle(WORDS.erklaeren),
  };
}

function drawWord(room, category) {
  const deck = room.decks[category];
  if (!deck.length) room.decks[category] = shuffle(WORDS[category]);
  return room.decks[category].pop();
}

function makeRoomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  } while (rooms[code]);
  return code;
}

function newRoom(code) {
  return {
    code,
    phase: "lobby", // lobby | ready | playing | turnEnd | finished
    boardSocketId: null,
    teams: [], // {id, name, score, playerIds: []}
    players: {}, // id -> {id, name, teamId, socketId, connected}
    decks: makeDecks(),
    turnSeconds: 60,
    secondsLeft: 0,
    currentTeamIndex: -1,
    categoryIndex: -1,
    currentTeamId: null,
    currentPlayerId: null,
    currentCategory: null,
    currentWord: null,
    turnCorrectCount: 0,
    lastSummary: null,
    teamTurnPointer: {}, // teamId -> index into playerIds
    timer: null,
  };
}

function publicState(room) {
  return {
    code: room.code,
    phase: room.phase,
    teams: room.teams.map((t) => ({
      id: t.id,
      name: t.name,
      score: t.score,
      players: t.playerIds.map((pid) => room.players[pid]).filter(Boolean).map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
    })),
    turnSeconds: room.turnSeconds,
    secondsLeft: room.secondsLeft,
    currentTeamId: room.currentTeamId,
    currentPlayerId: room.currentPlayerId,
    currentPlayerName: room.currentPlayerId ? (room.players[room.currentPlayerId] || {}).name : null,
    currentCategory: room.currentCategory,
    currentCategoryLabel: room.currentCategory ? CATEGORY_LABELS[room.currentCategory] : null,
    turnCorrectCount: room.turnCorrectCount,
    lastSummary: room.lastSummary,
  };
}

function broadcastState(room) {
  io.to(room.code).emit("room:state", publicState(room));
}

function sendWordToActivePlayer(room) {
  const player = room.players[room.currentPlayerId];
  if (!player || !player.socketId) return;
  io.to(player.socketId).emit("turn:word", {
    word: room.currentWord,
    category: room.currentCategory,
    categoryLabel: CATEGORY_LABELS[room.currentCategory],
  });
}

function teamsWithPlayers(room) {
  return room.teams.filter((t) => t.playerIds.length > 0);
}

function nextTurn(room) {
  const eligible = teamsWithPlayers(room);
  if (eligible.length < 2) return false;

  let idx = room.currentTeamIndex;
  let nextTeam = null;
  for (let i = 0; i < room.teams.length; i++) {
    idx = (idx + 1) % room.teams.length;
    if (room.teams[idx].playerIds.length > 0) {
      nextTeam = room.teams[idx];
      room.currentTeamIndex = idx;
      break;
    }
  }
  if (!nextTeam) return false;

  const pointer = room.teamTurnPointer[nextTeam.id] || 0;
  const playerId = nextTeam.playerIds[pointer % nextTeam.playerIds.length];
  room.teamTurnPointer[nextTeam.id] = (pointer + 1) % nextTeam.playerIds.length;

  room.categoryIndex = (room.categoryIndex + 1) % CATEGORY_ORDER.length;

  room.currentTeamId = nextTeam.id;
  room.currentPlayerId = playerId;
  room.currentCategory = CATEGORY_ORDER[room.categoryIndex];
  room.currentWord = null;
  room.turnCorrectCount = 0;
  room.lastSummary = null;
  room.phase = "ready";
  return true;
}

function startTimer(room) {
  room.phase = "playing";
  room.secondsLeft = room.turnSeconds;
  room.currentWord = drawWord(room, room.currentCategory);
  sendWordToActivePlayer(room);
  broadcastState(room);

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.secondsLeft--;
    if (room.secondsLeft <= 0) {
      clearInterval(room.timer);
      endTurn(room);
    } else {
      io.to(room.code).emit("turn:tick", { secondsLeft: room.secondsLeft });
    }
  }, 1000);
}

function endTurn(room) {
  clearInterval(room.timer);
  const team = room.teams.find((t) => t.id === room.currentTeamId);
  room.lastSummary = {
    teamName: team ? team.name : "",
    playerName: (room.players[room.currentPlayerId] || {}).name || "",
    correctCount: room.turnCorrectCount,
    categoryLabel: CATEGORY_LABELS[room.currentCategory],
  };
  room.currentWord = null;
  room.phase = "turnEnd";
  broadcastState(room);
}

function removePlayerFromAllTeams(room, playerId) {
  room.teams.forEach((t) => {
    t.playerIds = t.playerIds.filter((id) => id !== playerId);
  });
}

function isActiveDrawer(room, socket) {
  return (
    !!room &&
    room.phase === "playing" &&
    room.currentCategory === "zeichnen" &&
    socket.data.playerId === room.currentPlayerId
  );
}

io.on("connection", (socket) => {
  socket.on("board:create", (cb) => {
    const code = makeRoomCode();
    const room = newRoom(code);
    rooms[code] = room;
    room.boardSocketId = socket.id;
    socket.join(code);
    cb({ ok: true, code });
    broadcastState(room);
  });

  socket.on("board:rejoin", ({ code }, cb) => {
    const room = rooms[code];
    if (!room) return cb && cb({ ok: false, error: "Raum nicht gefunden" });
    room.boardSocketId = socket.id;
    socket.join(code);
    cb && cb({ ok: true });
    broadcastState(room);
  });

  socket.on("player:join", ({ code, name, playerId }, cb) => {
    const room = rooms[code];
    if (!room) return cb({ ok: false, error: "Raum-Code nicht gefunden" });

    let player = playerId ? room.players[playerId] : null;
    if (!player) {
      const id = "p" + Math.random().toString(36).slice(2, 10);
      player = { id, name: (name || "Spieler").slice(0, 24), teamId: null, socketId: socket.id, connected: true };
      room.players[id] = player;
    } else {
      player.socketId = socket.id;
      player.connected = true;
      if (name) player.name = name.slice(0, 24);
    }
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = player.id;
    cb({ ok: true, playerId: player.id, name: player.name, teamId: player.teamId });
    broadcastState(room);
  });

  socket.on("player:createTeam", ({ code, teamName }) => {
    const room = rooms[code];
    if (!room) return;
    const id = "t" + Math.random().toString(36).slice(2, 8);
    room.teams.push({ id, name: (teamName || "Team").slice(0, 24), score: 0, playerIds: [] });
    broadcastState(room);
  });

  socket.on("player:joinTeam", ({ code, teamId }) => {
    const room = rooms[code];
    if (!room) return;
    const player = room.players[socket.data.playerId];
    if (!player) return;
    removePlayerFromAllTeams(room, player.id);
    const team = room.teams.find((t) => t.id === teamId);
    if (team) {
      team.playerIds.push(player.id);
      player.teamId = teamId;
    } else {
      player.teamId = null;
    }
    broadcastState(room);
  });

  socket.on("board:startGame", ({ code, turnSeconds }) => {
    const room = rooms[code];
    if (!room) return;
    if (teamsWithPlayers(room).length < 2) return;
    room.turnSeconds = Math.max(15, Math.min(180, Number(turnSeconds) || 60));
    room.teams.forEach((t) => (t.score = 0));
    room.decks = makeDecks();
    room.currentTeamIndex = -1;
    room.categoryIndex = -1;
    nextTurn(room);
    broadcastState(room);
  });

  socket.on("player:ready", ({ code }) => {
    const room = rooms[code];
    if (!room || room.phase !== "ready") return;
    if (socket.data.playerId !== room.currentPlayerId) return;
    startTimer(room);
  });

  socket.on("player:correct", ({ code }) => {
    const room = rooms[code];
    if (!room || room.phase !== "playing") return;
    if (socket.data.playerId !== room.currentPlayerId) return;
    const team = room.teams.find((t) => t.id === room.currentTeamId);
    if (team) team.score++;
    room.turnCorrectCount++;
    room.currentWord = drawWord(room, room.currentCategory);
    sendWordToActivePlayer(room);
    broadcastState(room);
    if (room.currentCategory === "zeichnen") io.to(room.code).emit("draw:event", { type: "clear" });
  });

  socket.on("player:skip", ({ code }) => {
    const room = rooms[code];
    if (!room || room.phase !== "playing") return;
    if (socket.data.playerId !== room.currentPlayerId) return;
    room.currentWord = drawWord(room, room.currentCategory);
    sendWordToActivePlayer(room);
    if (room.currentCategory === "zeichnen") io.to(room.code).emit("draw:event", { type: "clear" });
  });

  socket.on("draw:start", ({ code, x, y }) => {
    const room = rooms[code];
    if (!isActiveDrawer(room, socket)) return;
    socket.to(code).emit("draw:event", { type: "start", x, y });
  });

  socket.on("draw:move", ({ code, x, y }) => {
    const room = rooms[code];
    if (!isActiveDrawer(room, socket)) return;
    socket.to(code).emit("draw:event", { type: "move", x, y });
  });

  socket.on("draw:end", ({ code }) => {
    const room = rooms[code];
    if (!isActiveDrawer(room, socket)) return;
    socket.to(code).emit("draw:event", { type: "end" });
  });

  socket.on("draw:clear", ({ code }) => {
    const room = rooms[code];
    if (!isActiveDrawer(room, socket)) return;
    io.to(code).emit("draw:event", { type: "clear" });
  });

  socket.on("board:nextTurn", ({ code }) => {
    const room = rooms[code];
    if (!room) return;
    if (nextTurn(room)) broadcastState(room);
  });

  socket.on("board:adjustScore", ({ code, teamId, delta }) => {
    const room = rooms[code];
    if (!room) return;
    const team = room.teams.find((t) => t.id === teamId);
    if (team) team.score = Math.max(0, team.score + (Number(delta) || 0));
    broadcastState(room);
  });

  socket.on("board:endGame", ({ code }) => {
    const room = rooms[code];
    if (!room) return;
    clearInterval(room.timer);
    room.phase = "finished";
    broadcastState(room);
  });

  socket.on("board:restart", ({ code }) => {
    const room = rooms[code];
    if (!room) return;
    room.teams.forEach((t) => (t.score = 0));
    room.decks = makeDecks();
    room.currentTeamIndex = -1;
    room.categoryIndex = -1;
    room.currentTeamId = null;
    room.currentPlayerId = null;
    room.currentCategory = null;
    room.currentWord = null;
    room.lastSummary = null;
    room.teamTurnPointer = {};
    room.phase = "lobby";
    broadcastState(room);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = code && rooms[code];
    if (room) {
      if (socket.data.playerId && room.players[socket.data.playerId]) {
        room.players[socket.data.playerId].connected = false;
        broadcastState(room);
      } else if (room.boardSocketId === socket.id) {
        room.boardSocketId = null;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Activity läuft auf Port ${PORT}`);
});
