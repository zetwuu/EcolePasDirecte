import { onRequest } from "firebase-functions/v2/https";
import app from "./server.js";

export const backend = onRequest({ region: "europe-west1" }, app);