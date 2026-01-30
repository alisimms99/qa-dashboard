# Database Setup Guide

## First Time Setup

### 1. Install MySQL (if not already installed)

```bash
brew install mysql
```

### 2. Start MySQL and set it to auto-start on boot

```bash
brew services start mysql
```

This will start MySQL now and automatically start it on system boot.

### 3. Create the database

```bash
mysql -u root
```

Then in the MySQL prompt:

```sql
CREATE DATABASE qa_dashboard;
exit;
```

Or use a one-liner:

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS qa_dashboard;"
```

### 4. Configure Database URL

Add to your `.env` file:

```bash
DATABASE_URL=mysql://root@localhost:3306/qa_dashboard
```

If your MySQL has a password:

```bash
DATABASE_URL=mysql://root:your_password@localhost:3306/qa_dashboard
```

### 5. Run migrations to create tables

```bash
npm run db:push
```

Or using drizzle-kit directly:

```bash
npx drizzle-kit push
```

## Daily Usage

Just run:

```bash
npm run dev
```

The app will automatically:
- ✅ Check if MySQL is running
- ✅ Start MySQL if needed
- ✅ Verify database connection
- ✅ Start the server
- ✅ Initialize the scheduler

## Manual MySQL Management

### Start MySQL manually

```bash
brew services start mysql
```

### Stop MySQL

```bash
brew services stop mysql
```

### Check MySQL status

```bash
brew services list
```

### Restart MySQL

```bash
brew services restart mysql
```

## Troubleshooting

### MySQL won't start automatically

If the automatic startup fails, start MySQL manually:

```bash
brew services start mysql
```

### Connection errors

1. **Check MySQL is running:**
   ```bash
   brew services list
   ```
   Look for `mysql` with status `started`

2. **Test MySQL connection:**
   ```bash
   mysql -u root
   ```
   If this fails, MySQL might not be running or credentials are wrong.

3. **Verify DATABASE_URL in .env:**
   ```bash
   cat .env | grep DATABASE_URL
   ```
   Should show: `DATABASE_URL=mysql://root@localhost:3306/qa_dashboard`

4. **Check database exists:**
   ```bash
   mysql -u root -e "SHOW DATABASES;" | grep qa_dashboard
   ```
   If it doesn't exist, create it:
   ```bash
   mysql -u root -e "CREATE DATABASE qa_dashboard;"
   ```

### Reset Database (if needed)

⚠️ **Warning: This will delete all data!**

```bash
mysql -u root -e "DROP DATABASE IF EXISTS qa_dashboard;"
mysql -u root -e "CREATE DATABASE qa_dashboard;"
npm run db:push
```

### Common Issues

**Issue: "Access denied for user 'root'@'localhost'"**

Solution: MySQL might require a password. Update your `.env`:
```bash
DATABASE_URL=mysql://root:your_password@localhost:3306/qa_dashboard
```

**Issue: "Can't connect to local MySQL server"**

Solution: MySQL is not running. Start it:
```bash
brew services start mysql
```

**Issue: "Unknown database 'qa_dashboard'"**

Solution: Database doesn't exist. Create it:
```bash
mysql -u root -e "CREATE DATABASE qa_dashboard;"
```

## Production Setup

For production environments, use a managed MySQL service (AWS RDS, PlanetScale, etc.) and update `DATABASE_URL` accordingly.

