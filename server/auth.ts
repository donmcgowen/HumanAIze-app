import bcryptjs from "bcryptjs";
import { users } from "../drizzle/schema.pg";
import { eq, or } from "drizzle-orm";
import { getDb } from "./db.pg";
import { getAzureSqlPool } from "./azureDb";
import { ENV } from "./_core/env";

const SALT_ROUNDS = 10;

type PublicUser = {
  id: number;
  username: string | null;
  email: string | null;
  name: string | null;
  role: string | null;
};

type SqlAuthUserRow = {
  id: number;
  username: string | null;
  email: string | null;
  name: string | null;
  role: string | null;
  passwordHash: string | null;
};

type SqlUsersColumns = {
  id: string;
  openId: string | null;
  username: string | null;
  email: string | null;
  name: string | null;
  role: string | null;
  passwordHash: string | null;
  loginMethod: string | null;
  lastSignedIn: string | null;
};

let cachedSqlUsersColumns: SqlUsersColumns | null = null;

function quoteIdent(identifier: string): string {
  return `[${identifier.replace(/\]/g, "]]")}]`;
}

function selectStringColumnOrNull(columnName: string | null, alias: string): string {
  if (!columnName) {
    return `CAST(NULL AS NVARCHAR(255)) AS ${quoteIdent(alias)}`;
  }

  return `${quoteIdent(columnName)} AS ${quoteIdent(alias)}`;
}

function findFirstMatchingColumn(
  availableColumnsLowerToOriginal: Map<string, string>,
  candidates: string[]
): string | null {
  for (const candidate of candidates) {
    const match = availableColumnsLowerToOriginal.get(candidate.toLowerCase());
    if (match) {
      return match;
    }
  }

  return null;
}

async function getSqlUsersColumns(pool: Awaited<ReturnType<typeof getSqlAuthPool>>): Promise<SqlUsersColumns> {
  if (!pool) {
    throw new Error("Azure SQL pool is not available");
  }

  if (cachedSqlUsersColumns) {
    return cachedSqlUsersColumns;
  }

  const result = await pool.request().query<{ columnName: string }>(
    `SELECT [COLUMN_NAME] AS [columnName]
     FROM [INFORMATION_SCHEMA].[COLUMNS]
     WHERE [TABLE_NAME] = 'users'`
  );

  const byLowerName = new Map<string, string>();
  for (const row of result.recordset ?? []) {
    if (row.columnName) {
      byLowerName.set(row.columnName.toLowerCase(), row.columnName);
    }
  }

  const idColumn = findFirstMatchingColumn(byLowerName, ["id", "user_id"]);
  if (!idColumn) {
    throw new Error("Could not find users table primary key column (id/user_id)");
  }

  cachedSqlUsersColumns = {
    id: idColumn,
    openId: findFirstMatchingColumn(byLowerName, ["openid", "open_id"]),
    username: findFirstMatchingColumn(byLowerName, ["username", "user_name"]),
    email: findFirstMatchingColumn(byLowerName, ["email", "email_address"]),
    name: findFirstMatchingColumn(byLowerName, ["name", "full_name", "display_name"]),
    role: findFirstMatchingColumn(byLowerName, ["role", "user_role"]),
    passwordHash: findFirstMatchingColumn(byLowerName, ["passwordhash", "password_hash", "password"]),
    loginMethod: findFirstMatchingColumn(byLowerName, ["loginmethod", "login_method", "auth_provider"]),
    lastSignedIn: findFirstMatchingColumn(byLowerName, ["lastsignedin", "last_signed_in", "last_login", "last_login_at"]),
  };

  return cachedSqlUsersColumns;
}

async function getSqlAuthPool() {
  if (!ENV.azureSqlConnectionString) {
    return null;
  }

  try {
    return await getAzureSqlPool();
  } catch (error) {
    console.error("[Auth] Azure SQL auth pool unavailable:", error);
    return null;
  }
}

function toPublicUser(user: SqlAuthUserRow): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

function isSqlUniqueConstraintError(error: any): boolean {
  return error?.number === 2627 || error?.number === 2601;
}

async function findSqlUserByUsernameOrEmail(username: string, email: string) {
  const pool = await getSqlAuthPool();
  if (!pool) {
    return { pool: null, existingByUsername: null as SqlAuthUserRow | null, existingByEmail: null as SqlAuthUserRow | null };
  }

  const columns = await getSqlUsersColumns(pool);
  const selectClause = [
    `${quoteIdent(columns.id)} AS [id]`,
    selectStringColumnOrNull(columns.username, "username"),
    selectStringColumnOrNull(columns.email, "email"),
    selectStringColumnOrNull(columns.name, "name"),
    selectStringColumnOrNull(columns.role, "role"),
    selectStringColumnOrNull(columns.passwordHash, "passwordHash"),
  ].join(", ");

  let existingByUsername: SqlAuthUserRow | null = null;
  if (columns.username) {
    const existingByUsernameResult = await pool
      .request()
      .input("username", username)
      .query<SqlAuthUserRow>(
        `SELECT TOP 1 ${selectClause} FROM [users] WHERE ${quoteIdent(columns.username)} = @username`
      );

    existingByUsername = existingByUsernameResult.recordset?.[0] ?? null;
  }

  let existingByEmail: SqlAuthUserRow | null = null;
  if (columns.email) {
    const existingByEmailResult = await pool
      .request()
      .input("email", email)
      .query<SqlAuthUserRow>(
        `SELECT TOP 1 ${selectClause} FROM [users] WHERE ${quoteIdent(columns.email)} = @email`
      );

    existingByEmail = existingByEmailResult.recordset?.[0] ?? null;
  }

  return {
    pool,
    existingByUsername,
    existingByEmail,
  };
}

export async function getAuthBackendHealth() {
  const mysqlDb = getDb();
  if (mysqlDb) {
    return { ok: true, mode: "neon" as const };
  }

  const sqlPool = await getSqlAuthPool();
  if (!sqlPool) {
    return { ok: false, mode: "none" as const };
  }

  try {
    await sqlPool.request().query("SELECT TOP 1 1 AS ok");
    return { ok: true, mode: "azure-sql-auth-fallback" as const };
  } catch (error) {
    console.error("[Auth] Azure SQL health query failed:", error);
    return { ok: false, mode: "azure-sql-auth-fallback" as const };
  }
}

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
  const db = getDb();

  const passwordHash = await hashPassword(password);

  if (!db) {
    const { pool, existingByUsername, existingByEmail } = await findSqlUserByUsernameOrEmail(username, email);
    if (!pool) {
      return { success: false, message: "Database not available" };
    }

    let columns: SqlUsersColumns;
    try {
      columns = await getSqlUsersColumns(pool);
    } catch (error) {
      console.error("[Auth] Unable to detect Azure SQL users columns:", error);
      return { success: false, message: "Failed to create account" };
    }

    if (!columns.email || !columns.passwordHash) {
      console.error("[Auth] users table is missing required columns for local auth:", {
        email: columns.email,
        passwordHash: columns.passwordHash,
      });
      return { success: false, message: "Authentication schema is not ready" };
    }

    if (existingByUsername) {
      return { success: false, message: "Username already exists" };
    }

    if (existingByEmail) {
      return { success: false, message: "Email already exists" };
    }

    try {
      const request = pool.request();
      const insertColumns: string[] = [];
      const insertValues: string[] = [];

      if (columns.username) {
        request.input("username", username);
        insertColumns.push(quoteIdent(columns.username));
        insertValues.push("@username");
      }

      if (columns.openId) {
        request.input("openId", `local:${email.toLowerCase()}`);
        insertColumns.push(quoteIdent(columns.openId));
        insertValues.push("@openId");
      }

      request.input("email", email);
      insertColumns.push(quoteIdent(columns.email));
      insertValues.push("@email");

      request.input("passwordHash", passwordHash);
      insertColumns.push(quoteIdent(columns.passwordHash));
      insertValues.push("@passwordHash");

      if (columns.name) {
        request.input("name", name || null);
        insertColumns.push(quoteIdent(columns.name));
        insertValues.push("@name");
      }

      if (columns.loginMethod) {
        request.input("loginMethod", "custom");
        insertColumns.push(quoteIdent(columns.loginMethod));
        insertValues.push("@loginMethod");
      }

      if (columns.lastSignedIn) {
        insertColumns.push(quoteIdent(columns.lastSignedIn));
        insertValues.push("SYSUTCDATETIME()");
      }

      const result = await request.query<{ id: number }>(
        `INSERT INTO [users] (${insertColumns.join(", ")})
         OUTPUT INSERTED.${quoteIdent(columns.id)} AS [id]
         VALUES (${insertValues.join(", ")})`
      );

      return {
        success: true,
        userId: result.recordset?.[0]?.id,
        message: "Account created successfully",
      };
    } catch (error: any) {
      if (isSqlUniqueConstraintError(error)) {
        if (String(error.message).toLowerCase().includes("username")) {
          return { success: false, message: "Username already exists" };
        }
        if (String(error.message).toLowerCase().includes("email")) {
          return { success: false, message: "Email already exists" };
        }
      }
      console.error("[Auth] Create user error (Azure SQL):", error);
      return { success: false, message: "Failed to create account" };
    }
  }

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
  const db = getDb();
  if (!db) {
    const pool = await getSqlAuthPool();
    if (!pool) {
      return { success: false, message: "Database not available" };
    }

    try {
      const columns = await getSqlUsersColumns(pool);
      if (!columns.passwordHash) {
        console.error("[Auth] users table is missing password hash column");
        return { success: false, message: "Authentication schema is not ready" };
      }

      const selectClause = [
        `${quoteIdent(columns.id)} AS [id]`,
        selectStringColumnOrNull(columns.username, "username"),
        selectStringColumnOrNull(columns.email, "email"),
        selectStringColumnOrNull(columns.name, "name"),
        selectStringColumnOrNull(columns.role, "role"),
        selectStringColumnOrNull(columns.passwordHash, "passwordHash"),
      ].join(", ");

      if (!columns.username && !columns.email) {
        console.error("[Auth] users table is missing both username and email columns");
        return { success: false, message: "Authentication schema is not ready" };
      }

      const whereClause = columns.username && columns.email
        ? `${quoteIdent(columns.username)} = @username OR ${quoteIdent(columns.email)} = @username`
        : `${quoteIdent((columns.username ?? columns.email)!)} = @username`;

      const result = await pool
        .request()
        .input("username", username)
        .query<SqlAuthUserRow>(
          `SELECT TOP 1 ${selectClause} FROM [users] WHERE ${whereClause}`
        );

      const userData = result.recordset?.[0];
      if (!userData || !userData.passwordHash) {
        return { success: false, message: "Invalid username or password" };
      }

      const isValidPassword = await verifyPassword(password, userData.passwordHash);
      if (!isValidPassword) {
        return { success: false, message: "Invalid username or password" };
      }

      if (columns.lastSignedIn) {
        await pool
          .request()
          .input("id", userData.id)
          .query(
            `UPDATE [users] SET ${quoteIdent(columns.lastSignedIn)} = SYSUTCDATETIME() WHERE ${quoteIdent(columns.id)} = @id`
          );
      }

      return {
        success: true,
        userId: userData.id,
        user: toPublicUser(userData),
      };
    } catch (error) {
      console.error("[Auth] Authentication error (Azure SQL):", error);
      return { success: false, message: "Authentication failed" };
    }
  }

  try {
    const user = await db
      .select()
      .from(users)
      .where(or(eq(users.username, username), eq(users.email, username)))
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
  const db = getDb();
  if (!db) {
    const pool = await getSqlAuthPool();
    if (!pool) {
      return null;
    }

    try {
      const columns = await getSqlUsersColumns(pool);
      const selectClause = [
        `${quoteIdent(columns.id)} AS [id]`,
        selectStringColumnOrNull(columns.username, "username"),
        selectStringColumnOrNull(columns.email, "email"),
        selectStringColumnOrNull(columns.name, "name"),
        selectStringColumnOrNull(columns.role, "role"),
        selectStringColumnOrNull(columns.passwordHash, "passwordHash"),
      ].join(", ");

      const result = await pool
        .request()
        .input("id", userId)
        .query<SqlAuthUserRow>(
          `SELECT TOP 1 ${selectClause} FROM [users] WHERE ${quoteIdent(columns.id)} = @id`
        );

      const userData = result.recordset?.[0];
      return userData ? toPublicUser(userData) : null;
    } catch (error) {
      console.error("[Auth] Get user error (Azure SQL):", error);
      return null;
    }
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

/**
 * Update a user's email address
 */
export async function updateUserEmail(userId: number, newEmail: string) {
  const db = getDb();
  if (!db) {
    const pool = await getSqlAuthPool();
    if (!pool) {
      return { success: false, message: "Database not available" };
    }

    try {
      const columns = await getSqlUsersColumns(pool);
      if (!columns.email) {
        return { success: false, message: "Authentication schema is not ready" };
      }

      const existingEmailResult = await pool
        .request()
        .input("email", newEmail)
        .input("userId", userId)
        .query<{ id: number }>(
          `SELECT TOP 1 ${quoteIdent(columns.id)} AS [id]
           FROM [users]
           WHERE ${quoteIdent(columns.email)} = @email
             AND ${quoteIdent(columns.id)} <> @userId`
        );

      if (existingEmailResult.recordset?.[0]) {
        return { success: false, message: "Email already exists" };
      }

      await pool
        .request()
        .input("userId", userId)
        .input("email", newEmail)
        .query(
          `UPDATE [users]
           SET ${quoteIdent(columns.email)} = @email
           WHERE ${quoteIdent(columns.id)} = @userId`
        );

      const updated = await getUserById(userId);
      return {
        success: true,
        user: updated,
      };
    } catch (error: any) {
      if (isSqlUniqueConstraintError(error)) {
        return { success: false, message: "Email already exists" };
      }
      console.error("[Auth] Update email error (Azure SQL):", error);
      return { success: false, message: "Failed to update email" };
    }
  }

  try {
    const existingByEmail = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, newEmail))
      .limit(1)
      .execute();

    if (existingByEmail.length > 0 && existingByEmail[0].id !== userId) {
      return { success: false, message: "Email already exists" };
    }

    await db
      .update(users)
      .set({ email: newEmail, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .execute();

    const updated = await getUserById(userId);
    return {
      success: true,
      user: updated,
    };
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") {
      return { success: false, message: "Email already exists" };
    }
    console.error("[Auth] Update email error:", error);
    return { success: false, message: "Failed to update email" };
  }
}
