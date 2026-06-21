import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditLog } from '../middleware/audit.js';
import { requireRole } from '../auth/rbac.js';

export const router = Router();

// ─── Message Encryption Helpers (AES-256-GCM) ────────────────────────────────

function getEncryptionKey(): Buffer {
  const key = process.env.MESSAGE_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('MESSAGE_ENCRYPTION_KEY environment variable is not set');
  }
  return Buffer.from(key.padEnd(32).slice(0, 32), 'utf8');
}

function encryptMessage(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decryptMessage(encryptedData: string): string {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted message format');
  }
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ─── Validation Schemas ─────────────────────────────────────────────────────

const createThreadSchema = z.object({
  recipientId: z.string().uuid('Invalid recipient ID'),
  subject: z.string().min(1, 'Subject is required').max(200),
  initialMessage: z.string().min(1, 'Message is required').max(5000),
});

const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(5000),
});

// ─── GET /messages/threads — List message threads for current user ──────────

router.get('/threads',
  requireRole('PATIENT', 'PROVIDER', 'ADMIN'),
  auditLog('VIEW', 'Message'),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.sub;

      // Get distinct thread IDs for messages where user is sender or recipient
      const threadMessages = await prisma.message.findMany({
        where: {
          OR: [
            { senderId: userId },
            { recipientId: userId },
          ],
        },
        select: { threadId: true },
        distinct: ['threadId'],
        orderBy: { sentAt: 'desc' },
      });

      const threadIds = threadMessages.map((m) => m.threadId);

      // Build thread list with latest message per thread
      const threads = await Promise.all(
        threadIds.map(async (threadId) => {
          const messages = await prisma.message.findMany({
            where: { threadId },
            orderBy: { sentAt: 'desc' },
            take: 1,
            include: {
              sender: { select: { id: true, email: true, role: true } },
            },
          });

          if (messages.length === 0) return null;
          const lastMsg = messages[0];
          const subject = lastMsg.threadSubject || 'Secure Message';
          // Determine the other participant
          const otherParticipantId = lastMsg.senderId === userId
            ? lastMsg.recipientId
            : lastMsg.senderId;

          return {
            threadId,
            subject,
            lastMessageAt: lastMsg.sentAt,
            otherParticipantId,
            otherParticipant: otherParticipantId ? {
              id: otherParticipantId,
              email: lastMsg.senderId === userId
                ? (lastMsg.recipientId || null)
                : lastMsg.sender?.email,
            } : null,
          };
        })
      );

      res.json({ threads: threads.filter(Boolean) });
    } catch (err) {
      console.error('List threads error:', err);
      res.status(500).json({ error: 'Failed to list message threads' });
    }
  }
);

// ─── POST /messages/threads — Create new message thread ───────────────────

router.post('/threads',
  requireRole('PATIENT', 'PROVIDER', 'ADMIN'),
  auditLog('CREATE', 'Message'),
  async (req: Request, res: Response) => {
    try {
      const body = createThreadSchema.parse(req.body);
      const { recipientId, subject, initialMessage } = body;
      const senderId = req.user!.sub;

      if (senderId === recipientId) {
        throw new AppError('Cannot create a thread with yourself', 400);
      }

      // Verify recipient exists
      const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
      if (!recipient) {
        throw new AppError('Recipient user not found', 404);
      }

      // Generate thread ID and encrypt message
      const threadId = randomUUID();
      const encryptedContent = encryptMessage(initialMessage);

      const message = await prisma.message.create({
        data: {
          threadId,
          senderId,
          recipientId,
          threadSubject: subject,
          encryptedContent,
        },
        include: {
          sender: { select: { id: true, email: true, role: true } },
        },
      });

      res.status(201).json({
        threadId,
        subject,
        message: {
          id: message.id,
          senderId: message.senderId,
          senderEmail: message.sender.email,
          content: initialMessage,
          sentAt: message.sentAt,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues });
        return;
      }
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error('Create thread error:', err);
      res.status(500).json({ error: 'Failed to create message thread' });
    }
  }
);

// ─── GET /messages/threads/:id — Get messages in thread ───────────────────

router.get('/threads/:id',
  requireRole('PATIENT', 'PROVIDER', 'ADMIN'),
  auditLog('VIEW', 'Message'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.sub;

      // Get all messages in this thread involving this user
      const messages = await prisma.message.findMany({
        where: {
          threadId: id,
          OR: [
            { senderId: userId },
            { recipientId: userId },
          ],
        },
        include: {
          sender: { select: { id: true, email: true, role: true } },
        },
        orderBy: { sentAt: 'asc' },
      });

      if (messages.length === 0) {
        throw new AppError('Thread not found or not authorized', 404);
      }

      // Get subject from first message
      const subject = messages[0].threadSubject || 'Secure Message';

      // Decrypt message content
      const decryptedMessages = messages.map((msg) => {
        let content = '[Decryption failed]';
        try {
          content = decryptMessage(msg.encryptedContent);
        } catch {
          // Keep placeholder if decryption fails
        }

        return {
          id: msg.id,
          senderId: msg.senderId,
          senderEmail: msg.sender.email,
          senderRole: msg.sender.role,
          content,
          sentAt: msg.sentAt,
          isOwnMessage: msg.senderId === userId,
        };
      });

      res.json({
        threadId: id,
        subject,
        messages: decryptedMessages,
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error('View thread error:', err);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  }
);

// ─── POST /messages/threads/:id — Send message in thread ─────────────────

router.post('/threads/:id',
  requireRole('PATIENT', 'PROVIDER', 'ADMIN'),
  auditLog('CREATE', 'Message'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const body = sendMessageSchema.parse(req.body);
      const { content } = body;
      const senderId = req.user!.sub;

      // Verify thread exists and user is a participant
      const existingMessages = await prisma.message.findMany({
        where: {
          threadId: id,
          OR: [
            { senderId },
            { recipientId: senderId },
          ],
        },
        take: 1,
      });

      if (existingMessages.length === 0) {
        throw new AppError('Thread not found or not authorized', 404);
      }

      // Get first message to determine recipient and subject
      const firstMsg = await prisma.message.findFirst({
        where: { threadId: id },
        orderBy: { sentAt: 'asc' },
      });

      // Determine recipient
      const recipientId = firstMsg?.senderId === senderId
        ? firstMsg?.recipientId
        : firstMsg?.senderId;

      // Encrypt and store message
      const encryptedContent = encryptMessage(content);

      const message = await prisma.message.create({
        data: {
          threadId: id,
          senderId,
          recipientId: recipientId || undefined,
          threadSubject: firstMsg?.threadSubject,
          encryptedContent,
        },
        include: {
          sender: { select: { id: true, email: true, role: true } },
        },
      });

      res.status(201).json({
        id: message.id,
        senderId: message.senderId,
        senderEmail: message.sender.email,
        content,
        sentAt: message.sentAt,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues });
        return;
      }
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      console.error('Send message error:', err);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
);
