import sql from "mssql";
import { ENV } from "./_core/env";

let _pool: sql.ConnectionPool | null = null;

export async function getAzureSqlPool(): Promise<sql.ConnectionPool> {
  if (_pool && _pool.connected) {
    return _pool;
  }

  try {
    // Parse Azure SQL connection string
    // Format: Server=tcp:host,port;Initial Catalog=db;User ID=user;Password=pass;Encrypt=True;...
    const connectionString = ENV.azureSqlConnectionString;
    
    if (!connectionString) {
      throw new Error("AZURE_SQL_CONNECTION_STRING is not set");
    }

    // Parse connection string into config object
    const config = parseConnectionString(connectionString);

    _pool = new sql.ConnectionPool(config);
    
    await _pool.connect();
    console.log("[Azure SQL] Connected successfully");
    
    return _pool;
  } catch (error) {
    console.error("[Azure SQL] Connection failed:", error);
    throw error;
  }
}

function parseConnectionString(connectionString: string): sql.config {
  const config: any = {
    authentication: {
      type: "default",
      options: {
        userName: "",
        password: "",
      },
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
      connectTimeout: 30000,
    },
  };

  // Parse key-value pairs
  const pairs = connectionString.split(";").filter((p) => p.trim());
  
  for (const pair of pairs) {
    const [key, value] = pair.split("=").map((s) => s.trim());
    
    if (!key || !value) continue;

    switch (key.toLowerCase()) {
      case "server":
        // Format: tcp:host,port or just host
        const serverPart = value.replace("tcp:", "").trim();
        const [host, port] = serverPart.split(",");
        config.server = host;
        if (port) {
          config.port = parseInt(port, 10);
        }
        break;
      case "initial catalog":
        config.database = value;
        break;
      case "user id":
        config.authentication.options.userName = value;
        break;
      case "password":
        config.authentication.options.password = value;
        break;
      case "encrypt":
        config.options.encrypt = value.toLowerCase() === "true";
        break;
      case "trustservercertificate":
        config.options.trustServerCertificate = value.toLowerCase() === "true";
        break;
      case "connection timeout":
        config.options.connectTimeout = parseInt(value, 10);
        break;
    }
  }

  return config as sql.config;
}

export async function closeAzureSqlPool(): Promise<void> {
  if (_pool) {
    await _pool.close();
    _pool = null;
    console.log("[Azure SQL] Connection closed");
  }
}
