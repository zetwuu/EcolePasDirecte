// ====== SYSTÈME DE MESSAGERIE FIREBASE ======
// Ce fichier gère toutes les communications avec Firebase

class FirebaseMessaging {
  constructor() {
    this.currentUser = sessionStorage.getItem("currentUser") || "User";
    this.currentConversation = null;
    this.messagesListener = null;
  }

  // 📤 ENVOYER UN MESSAGE
  async sendMessage(recipientName, messageText) {
    try {
      if (!messageText.trim()) return;

      const timestamp = new Date();
      const conversationId = this.getConversationId(this.currentUser, recipientName);

      const messageData = {
        sender: this.currentUser,
        recipient: recipientName,
        content: messageText,
        timestamp: timestamp.toISOString(),
        displayTime: timestamp.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' })
      };

      // Envoyer à la sous-collection "messages"
      await db.collection("conversations").doc(conversationId).collection("messages").add(messageData);

      // Mettre à jour le document de conversation
      await db.collection("conversations").doc(conversationId).set({
        participants: [this.currentUser, recipientName],
        lastMessage: messageText,
        lastSender: this.currentUser,
        lastTimestamp: timestamp
      }, { merge: true });

      console.log("✅ Message envoyé avec succès!");
      return true;
    } catch (error) {
      console.error("❌ Erreur lors de l'envoi:", error);
      alert("Erreur: " + error.message);
      return false;
    }
  }

  // 📥 CHARGER LES MESSAGES D'UNE CONVERSATION
  listenToConversation(recipientName, callback) {
    try {
      const conversationId = this.getConversationId(this.currentUser, recipientName);
      this.currentConversation = recipientName;

      // Arrêter l'écoute précédente si elle existe
      if (this.messagesListener) {
        this.messagesListener();
      }

      // Écouter les changements en temps réel
      this.messagesListener = db.collection("conversations")
        .doc(conversationId)
        .collection("messages")
        .orderBy("timestamp", "asc")
        .onSnapshot((snapshot) => {
          const messages = [];
          snapshot.forEach((doc) => {
            messages.push({
              id: doc.id,
              ...doc.data()
            });
          });
          callback(messages);
        }, (error) => {
          console.error("❌ Erreur d'écoute:", error);
          callback([]);
        });
    } catch (error) {
      console.error("❌ Erreur:", error);
      callback([]);
    }
  }

  // 🗑️ SUPPRIMER UNE CONVERSATION
  async deleteConversation(recipientName) {
    try {
      const conversationId = this.getConversationId(this.currentUser, recipientName);

      // Récupérer tous les messages
      const snapshot = await db.collection("conversations")
        .doc(conversationId)
        .collection("messages")
        .get();

      // Supprimer chaque message
      const batch = db.batch();
      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      // Supprimer la conversation
      await db.collection("conversations").doc(conversationId).delete();

      console.log("✅ Conversation supprimée!");
      return true;
    } catch (error) {
      console.error("❌ Erreur de suppression:", error);
      alert("Erreur: " + error.message);
      return false;
    }
  }

  // 👥 RÉCUPÉRER TOUTES LES CONVERSATIONS
  async getConversations() {
    try {
      const snapshot = await db.collection("conversations")
        .where("participants", "array-contains", this.currentUser)
        .orderBy("lastTimestamp", "desc")
        .get();

      const conversations = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Trouver le nom de l'autre participant
        const otherParticipant = data.participants.find(p => p !== this.currentUser);
        conversations.push({
          id: doc.id,
          name: otherParticipant,
          lastMessage: data.lastMessage,
          lastSender: data.lastSender,
          lastTimestamp: data.lastTimestamp
        });
      });

      return conversations;
    } catch (error) {
      console.error("❌ Erreur lors du chargement des conversations:", error);
      return [];
    }
  }

  // 🆔 GÉNÉRER UN ID DE CONVERSATION COHÉRENT
  // Important: Doit être le même peu importe qui lance (Alex ou Johan)
  getConversationId(user1, user2) {
    const sorted = [user1, user2].sort();
    return sorted.join("_");
  }

  // 🔚 ARRÊTER L'ÉCOUTE
  stopListening() {
    if (this.messagesListener) {
      this.messagesListener();
      this.messagesListener = null;
    }
  }
}

// Créer une instance globale
const firebaseMsg = new FirebaseMessaging();

console.log("✅ Module Firebase Messaging chargé!");
