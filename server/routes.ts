import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export async function registerRoutes(app: Express): Promise<Server> {
  // API endpoint to generate itinerary
  app.post("/api/generate-itinerary", async (req, res) => {
    try {
      const { location, startDate, endDate } = req.body;

      if (!location || !startDate || !endDate) {
        return res.status(400).json({ 
          error: "Missing required fields: location, startDate, endDate" 
        });
      }

      // Path to the Python script (adjust if needed)
      const scriptPath = path.join(process.cwd(), "promotfile.py");
      
      // Execute the Python script with arguments
      const command = `python "${scriptPath}" "${location}" "${startDate}" "${endDate}"`;
      
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer for large responses
      });

      // Parse the JSON output from the Python script
      const itinerary = JSON.parse(stdout);
      
      res.json(itinerary);
    } catch (error: any) {
      console.error("Error generating itinerary:", error);
      res.status(500).json({ 
        error: "Failed to generate itinerary",
        details: error.message 
      });
    }
  });

  // --- Demo auth endpoints (simple, for demo only) ---
  // Register a new user (passwords are hashed for demo safety)
  app.post("/api/register", async (req, res) => {
    try {
      const { username, password } = req.body ?? {};
      if (!username || !password) {
        return res.status(400).json({ error: "username and password are required" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ error: "username already taken" });
      }

      // Hash the password before storing
      const hashed = bcrypt.hashSync(password, 10);
      const user = await storage.createUser({ username, password: hashed });
      // don't return password in responses
      // cast to any to strip password property for demo simplicity
      const { password: _p, ...safe } = user as any;
      res.status(201).json(safe);
    } catch (err: any) {
      console.error("/api/register error", err?.message ?? err);
      res.status(500).json({ error: "failed to create user" });
    }
  });

  // Login (very basic demo check against stored plaintext password)
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body ?? {};
      if (!username || !password) {
        return res.status(400).json({ error: "username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) return res.status(401).json({ error: "invalid credentials" });

      // compare hashed password
      const ok = bcrypt.compareSync(password, user.password);
      if (!ok) return res.status(401).json({ error: "invalid credentials" });

      const { password: _p, ...safe } = user as any;
      res.json(safe);
    } catch (err: any) {
      console.error("/api/login error", err?.message ?? err);
      res.status(500).json({ error: "failed to login" });
    }
  });

  // List users (demo only — strips passwords)
  app.get("/api/users", async (_req, res) => {
    try {
      const users = await storage.listUsers();
      const safe = users.map((u) => {
        const { password: _p, ...rest } = u as any;
        return rest;
      });
      res.json(safe);
    } catch (err: any) {
      console.error("/api/users error", err?.message ?? err);
      res.status(500).json({ error: "failed to list users" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
