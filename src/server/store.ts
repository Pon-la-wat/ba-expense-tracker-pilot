import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Entry, EntryValues } from "../shared/ledger.js";
import { hashPassword } from "./password.js";

export interface Owner {
  email: string;
  passwordHash: string;
}

interface Data {
  owner: Owner | null;
  entries: Entry[];
}

/** The one account and its entries, kept in memory and written to a JSON file when a path is given. */
export class Store {
  private data: Data = { owner: null, entries: [] };

  constructor(private readonly file?: string) {
    if (file && existsSync(file)) this.data = JSON.parse(readFileSync(file, "utf8")) as Data;
  }

  get owner(): Owner | null {
    return this.data.owner;
  }

  setOwner(owner: Owner): void {
    this.data.owner = owner;
    this.save();
  }

  list(): Entry[] {
    return [...this.data.entries];
  }

  add(values: EntryValues): Entry {
    const entry = { id: randomUUID(), ...values };
    this.data.entries.push(entry);
    this.save();
    return entry;
  }

  update(id: string, values: EntryValues): Entry | undefined {
    const index = this.data.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return undefined;
    const entry = { id, ...values };
    this.data.entries[index] = entry;
    this.save();
    return entry;
  }

  remove(id: string): boolean {
    const before = this.data.entries.length;
    this.data.entries = this.data.entries.filter((entry) => entry.id !== id);
    if (this.data.entries.length === before) return false;
    this.save();
    return true;
  }

  private save(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.data));
    renameSync(temporary, this.file);
  }
}

export async function seedOwner(store: Store, email: string, password: string): Promise<void> {
  store.setOwner({ email: email.trim().toLowerCase(), passwordHash: await hashPassword(password) });
}
