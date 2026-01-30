/**
 * MySQL Startup Check Utility
 * Checks if MySQL is running and attempts to start it if needed
 */

import { exec } from "child_process";
import { promisify } from "util";
import { getDb } from "../db";

const execAsync = promisify(exec);

/**
 * Check if MySQL process is running
 */
export async function checkMySQLRunning(): Promise<boolean> {
  try {
    // Check if MySQL process is running (works on Mac/Linux)
    // Try both mysqld and mysql process names
    const { stdout } = await execAsync("pgrep -x mysqld || pgrep -x mysql || echo ''");
    return stdout.trim().length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Attempt to start MySQL using brew services (Mac)
 */
export async function startMySQL(): Promise<void> {
  try {
    console.log("🔄 Starting MySQL...");

    // Try to start MySQL using brew services (Mac)
    await execAsync("brew services start mysql");

    // Wait a few seconds for MySQL to start
    console.log("⏳ Waiting for MySQL to initialize...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("✅ MySQL started successfully");
  } catch (error) {
    console.error("❌ Failed to start MySQL automatically");
    console.error("Please start MySQL manually with: brew services start mysql");
    throw new Error("MySQL is not running and could not be started automatically");
  }
}

/**
 * Verify database connection by attempting to connect
 */
export async function verifyDatabaseConnection(): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) {
      return false;
    }
    // Try a simple query to verify connection
    await db.execute("SELECT 1");
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Ensure MySQL is running and database is accessible
 */
export async function ensureMySQLRunning(): Promise<void> {
  const isRunning = await checkMySQLRunning();

  if (!isRunning) {
    console.log("⚠️  MySQL is not running");
    try {
      await startMySQL();
    } catch (error) {
      console.error("\n❌ MySQL Startup Failed");
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.error("Please start MySQL manually with:");
      console.error("  brew services start mysql");
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      throw error;
    }
  } else {
    console.log("✅ MySQL is already running");
  }

  // Verify database connection
  console.log("🔍 Verifying database connection...");
  const isConnected = await verifyDatabaseConnection();

  if (!isConnected) {
    console.error("\n❌ Database Connection Failed");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("Could not connect to the database.");
    console.error("");
    console.error("Please check:");
    console.error("  1. DATABASE_URL is set correctly in .env");
    console.error("  2. Database exists: mysql -u root -e 'CREATE DATABASE IF NOT EXISTS qa_dashboard;'");
    console.error("  3. MySQL is accessible: mysql -u root");
    console.error("");
    console.error("Example DATABASE_URL:");
    console.error("  DATABASE_URL=mysql://root@localhost:3306/qa_dashboard");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    throw new Error("Database connection failed");
  }

  console.log("✅ Database connection verified");
}

