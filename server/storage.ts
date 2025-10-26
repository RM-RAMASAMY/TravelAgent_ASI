import { type User, type InsertUser } from "@shared/schema";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, patch: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  listUsers(): Promise<User[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, patch: Partial<InsertUser>): Promise<User | undefined> {
    const existing = this.users.get(id);
    if (!existing) return undefined;
    const updated: User = { ...existing, ...patch } as User;
    this.users.set(id, updated);
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  async listUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
}

// File-backed storage: persists users to server/data/users.json
export class FileStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private filePath: string;
  private ready: Promise<void>;

  constructor(file?: string) {
    this.filePath = file || path.join(process.cwd(), "server", "data", "users.json");
    this.ready = this.load().catch((err) => {
      // log and continue with empty data
      // eslint-disable-next-line no-console
      console.error("Failed to load users.json, starting with empty store:", err.message || err);
    });
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, { encoding: "utf8" });
      const arr = JSON.parse(raw) as User[];
      this.users = new Map(arr.map((u) => [u.id, u]));
    } catch (err: any) {
      // If file doesn't exist, start with empty array and create file
      if (err.code === "ENOENT") {
        await this.persist();
        this.users = new Map();
        return;
      }
      throw err;
    }
  }

  private async persist(): Promise<void> {
    const arr = Array.from(this.users.values());
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(arr, null, 2), { encoding: "utf8" });
  }

  private async waitReady() {
    await this.ready;
  }

  async getUser(id: string): Promise<User | undefined> {
    await this.waitReady();
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.waitReady();
    return Array.from(this.users.values()).find((u) => u.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    await this.waitReady();
    const id = randomUUID();
    const user: User = { ...insertUser, id } as User;
    this.users.set(id, user);
    await this.persist();
    return user;
  }

  async updateUser(id: string, patch: Partial<InsertUser>): Promise<User | undefined> {
    await this.waitReady();
    const existing = this.users.get(id);
    if (!existing) return undefined;
    const updated: User = { ...existing, ...patch } as User;
    this.users.set(id, updated);
    await this.persist();
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    await this.waitReady();
    const removed = this.users.delete(id);
    if (removed) await this.persist();
    return removed;
  }

  async listUsers(): Promise<User[]> {
    await this.waitReady();
    return Array.from(this.users.values());
  }
}

// choose storage implementation: prefer file storage (persistent)
export const storage: IStorage = new FileStorage();
