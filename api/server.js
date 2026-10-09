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
const port = Number(process.env.PORT) || 3000;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.get("origin");

  if (origin && allowedOrigins.length && !allowedOrigins.includes(origin)) {
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

app.listen(port, () => {
  console.log(`API EcolePasDirecte disponible sur http://localhost:${port}`);
});