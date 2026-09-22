import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { SendWhatsAppMessageBody } from "@workspace/api-zod";

const router: IRouter = Router();
const graphVersion = "v23.0";
type WebhookRequest = Request & { rawBody?: Buffer };
type WhatsAppDeliveryStatus = "accepted" | "sent" | "delivered" | "read" | "failed";
type StoredStatus = {
  messageId: string;
  status: WhatsAppDeliveryStatus;
  detail: string | null;
  updatedAt: string;
};

const messageStatuses = new Map<string, StoredStatus>();

function saveStatus(messageId: string, status: WhatsAppDeliveryStatus, detail: string | null = null) {
  messageStatuses.set(messageId, {
    messageId,
    status,
    detail,
    updatedAt: new Date().toISOString(),
  });
}

function verifyWebhookSignature(req: WebhookRequest) {
  const appSecret = process.env["WHATSAPP_APP_SECRET"];
  const signature = req.header("x-hub-signature-256");
  if (!appSecret || !signature || !req.rawBody) return false;

  const expected = `sha256=${createHmac("sha256", appSecret).update(req.rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

router.post("/whatsapp/send", async (req, res) => {
  const parsed = SendWhatsAppMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Phone number ID, recipient, and message are required." });
    return;
  }

  const { phoneNumberId, to, message } = parsed.data;
  const recipient = to.replace(/[^\d+]/g, "");
  if (!/^\+?\d{7,15}$/.test(recipient)) {
    res.status(400).json({ error: "Enter a mobile number with country code, for example +919876544102." });
    return;
  }

  try {
    const connectors = new ReplitConnectors();
    const response = await connectors.proxy(
      "whatsapp-business",
      `/${graphVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "text",
          text: { body: message, preview_url: false },
        }),
      },
    );
    const payload = (await response.json()) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      res.status(502).json({ error: payload.error?.message ?? "WhatsApp rejected this message." });
      return;
    }

    const messageId = payload.messages?.[0]?.id ?? null;
    if (messageId) saveStatus(messageId, "accepted");

    res.json({
      accepted: true,
      messageId,
      recipient,
      detail: "Accepted by WhatsApp. Delivery status may arrive shortly.",
    });
  } catch (error) {
    req.log.error({ err: error }, "WhatsApp send failed");
    res.status(502).json({ error: "WhatsApp could not be reached. Check the connection and phone number ID." });
  }
});

router.get("/whatsapp/webhook", (req, res) => {
  const verifyToken = process.env["WHATSAPP_WEBHOOK_VERIFY_TOKEN"];
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (!verifyToken) {
    res.status(503).send("WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured.");
    return;
  }

  if (mode === "subscribe" && token === verifyToken && typeof challenge === "string") {
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
});

router.post("/whatsapp/webhook", (req, res) => {
  const appSecret = process.env["WHATSAPP_APP_SECRET"];
  if (!appSecret) {
    res.status(503).json({ error: "WHATSAPP_APP_SECRET is not configured." });
    return;
  }

  if (!verifyWebhookSignature(req as WebhookRequest)) {
    res.status(403).json({ error: "Invalid WhatsApp webhook signature." });
    return;
  }

  const body = req.body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          statuses?: Array<{
            id?: string;
            status?: "sent" | "delivered" | "read" | "failed";
            errors?: Array<{ title?: string; message?: string }>;
          }>;
        };
      }>;
    }>;
  };

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (!status.id || !status.status) continue;
        const detail = status.errors?.map((error) => error.message ?? error.title).filter(Boolean).join("; ") || null;
        saveStatus(status.id, status.status, detail);
      }
    }
  }

  res.sendStatus(200);
});

router.get("/whatsapp/status", (req, res) => {
  const rawIds = typeof req.query.messageIds === "string" ? req.query.messageIds : "";
  const messageIds = rawIds.split(",").map((id) => id.trim()).filter(Boolean).slice(0, 100);
  res.json({ statuses: messageIds.map((messageId) => messageStatuses.get(messageId)).filter(Boolean) });
});

export default router;