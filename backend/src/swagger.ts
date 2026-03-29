import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "CCF Admin Portal API",
      version: "1.0.0",
      description:
        "API documentation for Cyber Chakra Forensics Admin Portal. This API serves two audiences: admin dashboard (JWT auth) and desktop application (license key auth).",
      contact: {
        name: "Cyber Chakra Digital Forensics",
        url: "https://cyberchakra.in",
      },
    },
    servers: [
      { url: "http://localhost:3001", description: "Development" },
      { url: "https://admin.cyberchakra.in", description: "Production" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Admin portal JWT token",
        },
        licenseKeyAuth: {
          type: "apiKey",
          in: "body",
          name: "license_key",
          description: "Desktop app license key (sent in request body)",
        },
      },
    },
    tags: [
      { name: "Auth", description: "Admin authentication" },
      { name: "Dashboard", description: "Dashboard statistics" },
      { name: "Licenses (Admin)", description: "License management" },
      { name: "Organizations", description: "Customer organization management" },
      { name: "Releases", description: "Software release management" },
      { name: "Announcements", description: "In-app announcement management" },
      { name: "Trials", description: "Trial request management" },
      { name: "Support", description: "Support ticket management" },
      { name: "Audit", description: "Audit log" },
      { name: "Desktop App", description: "Public API for CMF desktop application" },
    ],
  },
  apis: ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
