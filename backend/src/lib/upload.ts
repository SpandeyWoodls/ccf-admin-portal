import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

// ─── Configuration ─────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif",
  ".pdf", ".txt",
  ".doc", ".docx",
  ".zip",
]);

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
]);

// Upload directory — configurable via env, defaults to production Hostinger path
// or local ./uploads/tickets when in development.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  || (process.env.NODE_ENV === "development"
    ? path.join(process.cwd(), "uploads", "tickets")
    : "/home/u783066597/domains/cyberchakra.online/uploads/tickets");

// Ensure directory exists at startup
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ─── Multer storage ────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// ─── File filter ───────────────────────────────────────────────────────────

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    cb(new Error(`File type not allowed: ${ext}`));
    return;
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new Error(`MIME type not allowed: ${file.mimetype}`));
    return;
  }

  cb(null, true);
};

// ─── Export configured multer instance ─────────────────────────────────────

export const ticketUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5, // max 5 files per request
  },
});

/** The URL prefix for serving uploaded ticket files */
export const TICKET_UPLOADS_URL_PREFIX = "/uploads/tickets";

/** Absolute path on disk where ticket uploads are stored */
export const TICKET_UPLOADS_DIR = UPLOAD_DIR;
