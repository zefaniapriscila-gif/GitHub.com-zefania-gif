/**
 * POST /api/contact — sends a note from the contact form to Raihan's inbox through Resend.
 *
 * Environment variables (set them in the Vercel project settings):
 *   RESEND_API_KEY  required. An API key from resend.com.
 *   CONTACT_TO      optional. Where notes go. Defaults to znpchilla19@gmail.com.
 *   CONTACT_FROM    optional. The sender. Defaults to Resend's shared test sender, which only
 *                   delivers to the address the Resend account was made with. Use an address on
 *                   a domain verified in Resend to send anywhere else.
 *
 * The page posts JSON and reads a JSON reply. Without JavaScript the form posts
 * url-encoded fields and gets a short HTML page back.
 */

const TO = process.env.CONTACT_TO || "znpchilla19@gmail.com";
const FROM = process.env.CONTACT_FROM || "Portfolio <onboarding@resend.dev>";
const TOPICS = [
  "a web app",
  "data and machine learning",
  "maps and geospatial work",
  "a developer tool",
  "an internship",
  "something else",
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (value, max) => String(value ?? "").trim().slice(0, max);
const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function readFields(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return request.json();
  return Object.fromEntries(await request.formData());
}

function check(fields) {
  const note = {
    name: clean(fields.name, 100),
    email: clean(fields.email, 200),
    message: clean(fields.message, 5000),
    topic: TOPICS.includes(fields.topic) ? fields.topic : "something else",
  };
  const errors = {};
  if (!note.name) errors.name = "Add your name.";
  if (!note.email) errors.email = "Add an email I can reply to.";
  else if (!EMAIL.test(note.email)) errors.email = "That email looks incomplete.";
  if (!note.message) errors.message = "Write a few words about it.";
  return { note, errors };
}

async function send(note) {
  const text = [
    `From: ${note.name} <${note.email}>`,
    `About: ${note.topic}`,
    "",
    note.message,
    "",
    "Sent from the contact form on your portfolio. Reply to this email to answer.",
  ].join("\n");
  const html = `
    <p><strong>${escapeHtml(note.name)}</strong> &lt;${escapeHtml(note.email)}&gt;<br />About ${escapeHtml(note.topic)}</p>
    <p style="white-space: pre-wrap">${escapeHtml(note.message)}</p>
    <p style="color: #6b7280; font-size: 13px">Sent from the contact form on your portfolio. Reply to this email to answer.</p>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      reply_to: note.email,
      subject: `${note.name}: ${note.topic}`,
      text,
      html,
    }),
  });
  if (!response.ok) throw new Error(`Resend answered ${response.status}: ${await response.text()}`);
}

function reply(request, status, body) {
  if ((request.headers.get("accept") || "").includes("application/json")) return Response.json(body, { status });
  const line = body.ok
    ? "Your note is on its way. I'll write back soon."
    : Object.values(body.errors || {})[0] || body.error;
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Astro</title>` +
      `<body style="font: 18px/1.5 system-ui, sans-serif; max-width: 34em; margin: 20vh auto; padding: 0 20px">` +
      `<p>${escapeHtml(line)}</p><p><a href="/#contact">Back to the site</a></p>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json({ ok: false, error: "Send the note with POST." }, { status: 405, headers: { Allow: "POST" } });
    }

    let fields;
    try {
      fields = await readFields(request);
    } catch (err) {
      return reply(request, 400, { ok: false, error: "The note couldn't be read. Try sending it again." });
    }

    // Bots fill the hidden field, or submit faster than anyone types. Pretend it worked.
    if (fields.company || (fields.elapsed && Number(fields.elapsed) < 2500)) return reply(request, 200, { ok: true });

    const { note, errors } = check(fields);
    if (Object.keys(errors).length) return reply(request, 400, { ok: false, errors });

    if (!process.env.RESEND_API_KEY) {
      console.error("contact: RESEND_API_KEY is not set");
      return reply(request, 503, { ok: false, error: "The form isn't connected yet." });
    }

    try {
      await send(note);
      return reply(request, 200, { ok: true });
    } catch (err) {
      console.error("contact:", err);
      return reply(request, 502, { ok: false, error: "The note didn't go through." });
    }
  },
};
