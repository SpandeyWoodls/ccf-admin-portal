import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit } from "../lib/audit.js";
import { paginated } from "../lib/response.js";
import { parsePagination } from "../lib/pagination.js";
import { sendEmail } from "../services/email.js";
import { welcomeEmail } from "../services/email-templates.js";

const router = Router();

router.use(requireAuth);

// ─── Schemas ────────────────────────────────────────────────────────────────

const createOrgSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  orgType: z.enum(["government", "law_enforcement", "corporate", "academic", "private_lab", "individual"]),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().max(10).default("IN"),
  gstin: z.string().optional().nullable(),
  panNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateOrgSchema = createOrgSchema.partial();

const createContactSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  designation: z.string().optional().nullable(),
  role: z.enum(["primary", "billing", "technical", "decision_maker"]).default("primary"),
});

// ─── GET / (list organizations) ─────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/organizations:
 *   get:
 *     tags: [Organizations]
 *     summary: List organizations
 *     description: Paginated list of customer organizations with optional filters.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: orgType
 *         schema:
 *           type: string
 *           enum: [government, law_enforcement, corporate, academic, private_lab, individual]
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, slug, email, or city
 *     responses:
 *       200:
 *         description: Paginated organization list
 *       401:
 *         description: Not authenticated
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize } = parsePagination(req.query as Record<string, unknown>);
    const skip = (page - 1) * pageSize;

    const where: any = {};

    const validOrgTypes = ["government", "law_enforcement", "corporate", "academic", "private_lab", "individual"];
    if (req.query.orgType && validOrgTypes.includes(req.query.orgType as string)) {
      where.orgType = req.query.orgType as string;
    }

    if (req.query.isActive !== undefined) where.isActive = req.query.isActive === "true";

    const search = typeof req.query.search === "string" ? req.query.search.slice(0, 200) : undefined;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
        { email: { contains: search } },
        { city: { contains: search } },
      ];
    }

    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              licenses: true,
              contacts: true,
            },
          },
        },
      }),
      prisma.organization.count({ where }),
    ]);

    res.json({
      success: true,
      data: paginated(orgs, total, page, pageSize),
      error: null,
      message: "",
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id (organization detail) ────────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/organizations/{id}:
 *   get:
 *     tags: [Organizations]
 *     summary: Get organization detail
 *     description: Returns full organization details including contacts, licenses, and counts.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Organization detail
 *       404:
 *         description: Organization not found
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id as string },
      include: {
        contacts: { orderBy: { createdAt: "desc" } },
        licenses: {
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { activations: { where: { isActive: true } } } },
          },
        },
        _count: {
          select: {
            licenses: true,
            contacts: true,
            downloads: true,
            tickets: true,
          },
        },
      },
    });

    if (!org) {
      throw new AppError(404, "Organization not found", "NOT_FOUND");
    }

    res.json({ success: true, data: org, error: null, message: "" });
  } catch (err) {
    next(err);
  }
});

// ─── POST / (create organization) ──────────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/organizations:
 *   post:
 *     tags: [Organizations]
 *     summary: Create an organization
 *     description: Register a new customer organization. Requires admin or super_admin role.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, slug, orgType]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Maharashtra Cyber Police
 *               slug:
 *                 type: string
 *                 example: maharashtra-cyber-police
 *               orgType:
 *                 type: string
 *                 enum: [government, law_enforcement, corporate, academic, private_lab, individual]
 *               email:
 *                 type: string
 *                 format: email
 *                 nullable: true
 *               phone:
 *                 type: string
 *                 nullable: true
 *               city:
 *                 type: string
 *                 nullable: true
 *               state:
 *                 type: string
 *                 nullable: true
 *               country:
 *                 type: string
 *                 default: IN
 *               gstin:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Organization created
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 */
router.post(
  "/",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createOrgSchema.parse(req.body);

      const org = await prisma.organization.create({
        data: {
          name: body.name,
          slug: body.slug,
          orgType: body.orgType,
          email: body.email ?? null,
          phone: body.phone ?? null,
          address: body.address ?? null,
          city: body.city ?? null,
          state: body.state ?? null,
          country: body.country,
          gstin: body.gstin ?? null,
          panNumber: body.panNumber ?? null,
          notes: body.notes ?? null,
        },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "create_organization",
        resourceType: "organization",
        resourceId: org.id,
        newValues: { name: body.name, slug: body.slug, orgType: body.orgType },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      // Send welcome email
      if (org.email) {
        const { subject, html } = welcomeEmail(body.name, org.name);
        sendEmail(org.email, subject, html).catch(() => {});
      }

      res.status(201).json({ success: true, data: org, error: null, message: "Organization created" });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /:id (update organization) ──────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/organizations/{id}:
 *   patch:
 *     tags: [Organizations]
 *     summary: Update an organization
 *     description: Update organization fields. Requires admin or super_admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               orgType:
 *                 type: string
 *               email:
 *                 type: string
 *                 nullable: true
 *               phone:
 *                 type: string
 *                 nullable: true
 *               city:
 *                 type: string
 *                 nullable: true
 *               state:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Organization updated
 *       404:
 *         description: Organization not found
 */
router.patch(
  "/:id",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateOrgSchema.parse(req.body);

      const existing = await prisma.organization.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new AppError(404, "Organization not found", "NOT_FOUND");

      const updated = await prisma.organization.update({
        where: { id: req.params.id as string },
        data: body as any,
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "update_organization",
        resourceType: "organization",
        resourceId: existing.id,
        oldValues: existing,
        newValues: body,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({ success: true, data: updated, error: null, message: "Organization updated" });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id/contacts ─────────────────────────────────────────────────────

router.get("/:id/contacts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: req.params.id as string } });
    if (!org) throw new AppError(404, "Organization not found", "NOT_FOUND");

    const contacts = await prisma.contact.findMany({
      where: { organizationId: req.params.id as string },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: contacts, error: null, message: "" });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/contacts (add contact) ──────────────────────────────────────

router.post(
  "/:id/contacts",
  requireRole("admin", "super_admin", "support"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createContactSchema.parse(req.body);

      const org = await prisma.organization.findUnique({ where: { id: req.params.id as string } });
      if (!org) throw new AppError(404, "Organization not found", "NOT_FOUND");

      const contact = await prisma.contact.create({
        data: {
          organizationId: req.params.id as string,
          name: body.name,
          email: body.email ?? null,
          phone: body.phone ?? null,
          designation: body.designation ?? null,
          role: body.role,
        },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "create_contact",
        resourceType: "contact",
        resourceId: contact.id,
        newValues: { name: body.name, organizationId: req.params.id as string },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.status(201).json({ success: true, data: contact, error: null, message: "Contact added" });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
