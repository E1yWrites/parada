import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL?.includes("parada_test")) {
  throw new Error(
    "Refusing to run database tests against a non-test database. " +
      "Set DATABASE_URL to the parada_test database."
  );
}
