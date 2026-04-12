import bcryptjs from "bcryptjs";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "./db";

const SALT_ROUNDS = 10;

/**
 * Hash a password using bcryptjs
 */
export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, SALT_ROUNDS);
}

/**
 * Compare a password with its hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

/**
 * Create a new user account with username and password
 */
export async function createUser(username: string, email: string, password: string, name?: string) {
  const db = await getDb();
  if (!db) {
    return { success: false, message: "Database not available" };
  }

  const passwordHash = await hashPassword(password);

  try {
    const result = await db
      .insert(users)
      .values({
        username,
        email,
        passwordHash,
        name: name || null,
        loginMethod: "custom",
        lastSignedIn: new Date(),
      })
      .execute();

    return {
      success: true,
      userId: (result as any).insertId,
      message: "Account created successfully",
    };
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      if (error.message.includes("username")) {
        return { success: false, message: "Username already exists" };
      }
      if (error.message.includes("email")) {
        return { success: false, message: "Email already exists" };
      }
    }
    console.error("[Auth] Create user error:", error);
    return { success: false, message: "Failed to create account" };
  }
}

/**
 * Authenticate a user with username and password
 */
export async function authenticateUser(username: string, password: string) {
  const db = await getDb();
  if (!db) {
    return { success: false, message: "Database not available" };
  }

  try {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1)
      .execute();

    if (!user || user.length === 0) {
      return { success: false, message: "Invalid username or password" };
    }

    const userData = user[0];
    if (!userData.passwordHash) {
      return { success: false, message: "Invalid username or password" };
    }

    const isValidPassword = await verifyPassword(password, userData.passwordHash);
    if (!isValidPassword) {
      return { success: false, message: "Invalid username or password" };
    }

    // Update last signed in
    await db
      .update(users)
      .set({ lastSignedIn: new Date() })
      .where(eq(users.id, userData.id))
      .execute();

    return {
      success: true,
      userId: userData.id,
      user: {
        id: userData.id,
        username: userData.username,
        email: userData.email,
        name: userData.name,
        role: userData.role,
      },
    };
  } catch (error) {
    console.error("[Auth] Authentication error:", error);
    return { success: false, message: "Authentication failed" };
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) {
    return null;
  }

  try {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .execute();

    if (!user || user.length === 0) {
      return null;
    }

    const userData = user[0];
    return {
      id: userData.id,
      username: userData.username,
      email: userData.email,
      name: userData.name,
      role: userData.role,
    };
  } catch (error) {
    console.error("[Auth] Get user error:", error);
    return null;
  }
}
