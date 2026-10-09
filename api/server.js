import "dotenv/config";
import express from "express";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID
});

const app = express();
const db = getFirestore();
const allowedOrigins = [...new Set([
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "https://zetwuu.github.io",
  "https://brawlcoltdina-oss.github.io",
  ...(process.env.ALLOWED_ORIGINS || "").split(",")
].map((origin) => origin.trim()).filter(Boolean))];

app.use((req, res, next) => {
  const origin = req.get("origin");

  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: "Origine non autorisée." });
  }

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "16kb" }));

app.get("/", (req, res) => {
  res.json({
    name: "API EcolePasDirecte",
    health: "/api/health"
  });
});

function requireUser(req, res, next) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token) return res.status(401).json({ error: "Connexion requise." });

  getAuth()
    .verifyIdToken(token)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(() => res.status(401).json({ error: "Jeton invalide ou expiré." }));
}

function conversationId(userId, otherUserId) {
  return [userId, otherUserId].sort().join("_");
}

function validOtherUserId(userId, otherUserId) {
  return typeof otherUserId === "string" && otherUserId.length > 0 && otherUserId !== userId;
}

async function getUsername(uid) {
  const profile = await db.collection("users").doc(uid).get();
  return profile.data()?.username || null;
}

async function getChatForUser(uid, chatId) {
  const username = await getUsername(uid);
  if (!username) return { error: "Profil introuvable.", status: 404 };

  const chatRef = db.collection("conversations").doc(chatId);
  const chat = await chatRef.get();
  if (!chat.exists) return { error: "Conversation introuvable.", status: 404 };
  if (!chat.data().participants?.includes(username)) {
    return { error: "Accès refusé à cette conversation.", status: 403 };
  }

  return { username, chatRef, data: chat.data() };
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/profile", requireUser, async (req, res) => {
  const profile = await db.collection("users").doc(req.user.uid).get();
  if (!profile.exists) return res.status(404).json({ error: "Profil introuvable." });
  res.json({ id: req.user.uid, ...profile.data() });
});

app.patch("/api/profile", requireUser, async (req, res) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: "Le nom doit contenir entre 3 et 30 caractères." });
  }

  const profileRef = db.collection("users").doc(req.user.uid);
  await profileRef.set({ username, displayName: username }, { merge: true });
  res.json({ id: req.user.uid, username });
});

app.get("/api/chat/conversations", requireUser, async (req, res) => {
  const username = await getUsername(req.user.uid);
  if (!username) return res.status(404).json({ error: "Profil introuvable." });

  const snapshot = await db.collection("conversations")
    .where("participants", "array-contains", username)
    .limit(100)
    .get();

  res.json(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
});

app.get("/api/chat/conversations/:chatId/messages", requireUser, async (req, res) => {
  const chat = await getChatForUser(req.user.uid, req.params.chatId);
  if (chat.error) return res.status(chat.status).json({ error: chat.error });

  const snapshot = await chat.chatRef.collection("messages")
    .orderBy("timestamp", "desc")
    .limit(100)
    .get();
  res.json(snapshot.docs.reverse().map((document) => ({ id: document.id, ...document.data() })));
});

app.post("/api/chat/conversations", requireUser, async (req, res) => {
  const username = await getUsername(req.user.uid);
  const recipientName = typeof req.body.recipientName === "string"
    ? req.body.recipientName.trim()
    : "";
  if (!username) return res.status(404).json({ error: "Profil introuvable." });
  if (!recipientName || recipientName.length > 30 || recipientName === username) {
    return res.status(400).json({ error: "Destinataire invalide." });
  }

  const recipient = await db.collection("users")
    .where("username", "==", recipientName)
    .limit(1)
    .get();
  if (recipient.empty) return res.status(404).json({ error: "Utilisateur introuvable." });

  const participants = [username, recipientName].sort();
  const chatId = participants.join("_");
  await db.collection("conversations").doc(chatId).set({
    participants,
    isGroup: false,
    lastMessage: "",
    lastSender: username,
    lastTimestamp: FieldValue.serverTimestamp()
  }, { merge: true });

  res.status(201).json({ id: chatId, participants, isGroup: false });
});

app.post("/api/chat/conversations/:chatId/messages", requireUser, async (req, res) => {
  const chat = await getChatForUser(req.user.uid, req.params.chatId);
  if (chat.error) return res.status(chat.status).json({ error: chat.error });

  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  if (!content || content.length > 2000) {
    return res.status(400).json({ error: "Le message doit contenir entre 1 et 2000 caractères." });
  }

  const message = {
    sender: chat.username,
    content,
    timestamp: FieldValue.serverTimestamp(),
    reactions: {},
    readBy: [chat.username]
  };
  const messageRef = await chat.chatRef.collection("messages").add(message);
  await chat.chatRef.set({
    lastMessage: content,
    lastSender: chat.username,
    lastTimestamp: FieldValue.serverTimestamp()
  }, { merge: true });

  res.status(201).json({ id: messageRef.id, ...message, timestamp: new Date().toISOString() });
});

app.patch("/api/chat/conversations/:chatId/messages/:messageId/reaction", requireUser, async (req, res) => {
  const chat = await getChatForUser(req.user.uid, req.params.chatId);
  if (chat.error) return res.status(chat.status).json({ error: chat.error });

  const emoji = req.body.emoji;
  const allowedReactions = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
  if (emoji !== null && !allowedReactions.includes(emoji)) {
    return res.status(400).json({ error: "Réaction invalide." });
  }

  const messageRef = chat.chatRef.collection("messages").doc(req.params.messageId);
  const message = await messageRef.get();
  if (!message.exists) return res.status(404).json({ error: "Message introuvable." });

  const reactions = message.data().reactions || {};
  if (emoji === null) delete reactions[chat.username];
  else reactions[chat.username] = emoji;
  await messageRef.update({ reactions });
  res.json({ reactions });
});

app.delete("/api/chat/conversations/:chatId/messages/:messageId", requireUser, async (req, res) => {
  const chat = await getChatForUser(req.user.uid, req.params.chatId);
  if (chat.error) return res.status(chat.status).json({ error: chat.error });

  const messageRef = chat.chatRef.collection("messages").doc(req.params.messageId);
  const message = await messageRef.get();
  if (!message.exists) return res.status(404).json({ error: "Message introuvable." });
  if (message.data().sender !== chat.username) {
    return res.status(403).json({ error: "Tu peux uniquement supprimer tes messages." });
  }

  await messageRef.delete();
  res.sendStatus(204);
});

app.delete("/api/chat/conversations/:chatId", requireUser, async (req, res) => {
  const chat = await getChatForUser(req.user.uid, req.params.chatId);
  if (chat.error) return res.status(chat.status).json({ error: chat.error });
  if (chat.data.isGeneralGroup) {
    return res.status(403).json({ error: "Le groupe général ne peut pas être supprimé." });
  }

  const messages = await chat.chatRef.collection("messages").get();
  for (let start = 0; start < messages.docs.length; start += 450) {
    const batch = db.batch();
    messages.docs.slice(start, start + 450).forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
  await chat.chatRef.delete();
  res.sendStatus(204);
});

app.get("/api/conversations", requireUser, async (req, res) => {
  const snapshot = await db.collection("conversations")
    .where("participantIds", "array-contains", req.user.uid)
    .limit(100)
    .get();

  const conversations = snapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      otherUserId: data.participantIds.find((id) => id !== req.user.uid),
      lastMessage: data.lastMessage || "",
      updatedAt: data.updatedAt || null
    };
  });

  conversations.sort((first, second) =>
    (second.updatedAt?.toMillis?.() || 0) - (first.updatedAt?.toMillis?.() || 0)
  );
  res.json(conversations);
});

app.get("/api/messages/:otherUserId", requireUser, async (req, res) => {
  const otherUserId = req.params.otherUserId;
  if (!validOtherUserId(req.user.uid, otherUserId)) {
    return res.status(400).json({ error: "Destinataire invalide." });
  }

  const id = conversationId(req.user.uid, otherUserId);
  const conversation = await db.collection("conversations").doc(id).get();
  if (!conversation.exists || !conversation.data().participantIds?.includes(req.user.uid)) {
    return res.json([]);
  }

  const snapshot = await db.collection("conversations").doc(id).collection("messages")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  res.json(snapshot.docs.reverse().map((document) => ({ id: document.id, ...document.data() })));
});

app.post("/api/messages", requireUser, async (req, res) => {
  const { recipientId, content } = req.body;
  if (!validOtherUserId(req.user.uid, recipientId)) {
    return res.status(400).json({ error: "Destinataire invalide." });
  }
  if (typeof content !== "string" || !content.trim() || content.trim().length > 2000) {
    return res.status(400).json({ error: "Le message doit contenir entre 1 et 2000 caractères." });
  }

  const recipient = await db.collection("users").doc(recipientId).get();
  if (!recipient.exists) return res.status(404).json({ error: "Destinataire introuvable." });

  const id = conversationId(req.user.uid, recipientId);
  const conversationRef = db.collection("conversations").doc(id);
  const senderProfile = await db.collection("users").doc(req.user.uid).get();
  const senderName = senderProfile.data()?.username || req.user.name || "Utilisateur";
  const recipientName = recipient.data().username || "Utilisateur";
  const message = {
    senderId: req.user.uid,
    recipientId,
    sender: senderName,
    recipient: recipientName,
    content: content.trim(),
    createdAt: FieldValue.serverTimestamp()
  };

  const messageRef = await conversationRef.collection("messages").add(message);
  await conversationRef.set({
    participantIds: [req.user.uid, recipientId].sort(),
    lastMessage: message.content,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  res.status(201).json({ id: messageRef.id, ...message, createdAt: new Date().toISOString() });
});

app.delete("/api/conversations/:otherUserId", requireUser, async (req, res) => {
  const otherUserId = req.params.otherUserId;
  if (!validOtherUserId(req.user.uid, otherUserId)) {
    return res.status(400).json({ error: "Destinataire invalide." });
  }

  const conversationRef = db.collection("conversations")
    .doc(conversationId(req.user.uid, otherUserId));
  const conversation = await conversationRef.get();
  if (!conversation.exists || !conversation.data().participantIds?.includes(req.user.uid)) {
    return res.status(404).json({ error: "Conversation introuvable." });
  }

  const messages = await conversationRef.collection("messages").get();
  for (let start = 0; start < messages.docs.length; start += 450) {
    const batch = db.batch();
    messages.docs.slice(start, start + 450).forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
  await conversationRef.delete();
  res.sendStatus(204);
});

const electionRef = db.collection("elections").doc("class-representative");
const candidates = ["Alex", "Johan", "Aucun"];

app.get("/api/votes", requireUser, async (req, res) => {
  const [election, ballot] = await Promise.all([
    electionRef.get(),
    electionRef.collection("ballots").doc(req.user.uid).get()
  ]);
  const counts = election.data()?.counts || Object.fromEntries(candidates.map((name) => [name, 0]));
  res.json({ counts, hasVoted: ballot.exists, choice: ballot.data()?.choice || null });
});

app.post("/api/votes", requireUser, async (req, res) => {
  const choice = req.body.choice;
  if (!candidates.includes(choice)) {
    return res.status(400).json({ error: "Choix invalide." });
  }

  const ballotRef = electionRef.collection("ballots").doc(req.user.uid);
  try {
    const counts = await db.runTransaction(async (transaction) => {
      const ballot = await transaction.get(ballotRef);
      if (ballot.exists) {
        const error = new Error("Vous avez déjà voté.");
        error.status = 409;
        throw error;
      }

      const election = await transaction.get(electionRef);
      const currentCounts = election.data()?.counts || Object.fromEntries(candidates.map((name) => [name, 0]));
      const nextCounts = { ...currentCounts, [choice]: (currentCounts[choice] || 0) + 1 };
      transaction.set(electionRef, { counts: nextCounts }, { merge: true });
      transaction.create(ballotRef, { choice, createdAt: FieldValue.serverTimestamp() });
      return nextCounts;
    });

    res.status(201).json({ counts, hasVoted: true, choice });
  } catch (error) {
    if (error.status === 409) return res.status(409).json({ error: error.message });
    throw error;
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Erreur interne de l'API." });
});

const port = Number(process.env.PORT) || 3000;
if (!process.env.K_SERVICE && !process.env.FUNCTION_TARGET && !process.env.FUNCTIONS_EMULATOR) {
  app.listen(port, () => {
    console.log(`API EcolePasDirecte disponible sur http://localhost:${port}`);
  });
}

export default app;